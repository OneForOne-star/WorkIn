<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use App\Support\PayNotifier;
use App\Support\Periods;
use App\Support\Rut;
use App\Support\Time;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Cierre de períodos de pago y resúmenes por trabajador. */
class PeriodController extends Controller
{
    /** Períodos cerrados + el siguiente por cerrar. */
    public function index(Request $request): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $cycle = (string) DB::table('companies')->where('id', $companyId)->value('payment_cycle');

        $periods = DB::table('payment_periods')->where('company_id', $companyId)
            ->orderByDesc('start_date')->limit(60)->get();

        $stats = DB::table('payment_statements')->where('company_id', $companyId)
            ->whereIn('payment_period_id', $periods->pluck('id'))
            ->groupBy('payment_period_id', 'status')
            ->selectRaw('payment_period_id, status, COUNT(*) as n')->get()->groupBy('payment_period_id');

        $next = Periods::next($companyId, $cycle);
        if ($next) {
            unset($next['rows']);
        }

        return response()->json([
            'cycle' => $cycle,
            'next' => $next,
            'data' => $periods->map(function ($p) use ($stats) {
                $by = ($stats[$p->id] ?? collect())->pluck('n', 'status');

                return $this->periodApi($p) + ['statements' => [
                    'pending' => (int) ($by['pending'] ?? 0), 'sent' => (int) ($by['sent'] ?? 0),
                    'accepted' => (int) ($by['accepted'] ?? 0), 'disputed' => (int) ($by['disputed'] ?? 0),
                ]];
            })->values(),
        ]);
    }

    /** El período por cerrar con el detalle de cada trabajador: por qué se le paga lo que se le paga. */
    public function pending(Request $request): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $cycle = (string) DB::table('companies')->where('id', $companyId)->value('payment_cycle');
        $next = Periods::next($companyId, $cycle);
        if (! $next) {
            return response()->json(['period' => null, 'data' => []]);
        }

        $byUser = [];
        foreach ($next['rows'] as $r) {
            $b = $byUser[$r['user_id']] ?? ['shifts' => 0, 'ot' => 0.0, 'amount' => 0, 'ids' => []];
            $byUser[$r['user_id']] = ['shifts' => $b['shifts'] + 1, 'ot' => $b['ot'] + $r['overtime_hours'], 'amount' => $b['amount'] + $r['amount'], 'ids' => array_merge($b['ids'], [$r['id']])];
        }
        $users = DB::table('users')->whereIn('id', array_keys($byUser))->get(['id', 'rut', 'first_name', 'last_name'])->keyBy('id');
        $lines = Periods::linesByUser(array_merge(...array_column($byUser, 'ids')));

        $data = collect($byUser)->map(fn ($b, $uid) => [
            'user_id' => (int) $uid,
            'rut' => Rut::format($users[$uid]->rut),
            'first_name' => $users[$uid]->first_name,
            'last_name' => $users[$uid]->last_name,
            'shifts' => $b['shifts'],
            'overtime_hours' => round($b['ot'], 2),
            'amount' => $b['amount'],
            'lines' => $lines[$uid] ?? [],
        ])->sortBy(fn ($r) => $r['first_name'].' '.$r['last_name'])->values();

        $ids = array_column($next['rows'], 'id');
        $next['pending_requests'] = (int) DB::table('overtime_requests')->where('company_id', $companyId)->where('status', 'pending')->whereIn('attendance_id', $ids)->count();
        $next['late_exits'] = count(Periods::lateExits($companyId, $ids));
        unset($next['rows']);

        return response()->json(['period' => $next, 'data' => $data]);
    }

    /** Cierra el siguiente período: fija las asistencias y crea un resumen por trabajador. */
    public function close(Request $request): JsonResponse
    {
        $user = $request->user();
        $companyId = (int) $user->company_id;

        return DB::transaction(function () use ($user, $companyId) {
            $company = DB::table('companies')->where('id', $companyId)->lockForUpdate()->first();
            $next = Periods::next($companyId, $company->payment_cycle);

            if (! $next) {
                return response()->json(['message' => 'No hay asistencias completas pendientes de pago.', 'code' => 'NOTHING_TO_CLOSE'], 422);
            }
            if (! $next['can_close']) {
                return response()->json([
                    'message' => 'El período del '.Periods::fmtDate($next['start_date']).' al '.Periods::fmtDate($next['end_date']).' aún no termina.',
                    'code' => 'PERIOD_NOT_FINISHED',
                ], 409);
            }

            $open = DB::table('overtime_requests')->where('company_id', $companyId)->where('status', 'pending')
                ->whereIn('attendance_id', array_column($next['rows'], 'id'))->count();
            if ($open > 0) {
                return response()->json([
                    'message' => $open === 1 ? 'Hay una solicitud de horas extra sin responder. Apruébala o recházala antes de cerrar.' : "Hay {$open} solicitudes de horas extra sin responder. Apruébalas o recházalas antes de cerrar.",
                    'code' => 'PENDING_OVERTIME',
                ], 409);
            }

            $now = now();
            $periodId = DB::table('payment_periods')->insertGetId([
                'company_id' => $companyId, 'cycle' => $company->payment_cycle,
                'start_date' => $next['start_date'], 'end_date' => $next['end_date'], 'status' => 'closed',
                'total_shifts' => $next['shifts'], 'total_overtime_hours' => $next['overtime_hours'], 'total_amount' => $next['amount'],
                'closed_by' => $user->id, 'closed_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ]);

            DB::table('attendances')->whereIn('id', array_column($next['rows'], 'id'))
                ->whereNull('payment_period_id')->update(['payment_period_id' => $periodId, 'updated_at' => $now]);

            $byUser = [];
            foreach ($next['rows'] as $r) {
                $b = $byUser[$r['user_id']] ?? ['shifts' => 0, 'ot' => 0.0, 'amount' => 0];
                $byUser[$r['user_id']] = ['shifts' => $b['shifts'] + 1, 'ot' => $b['ot'] + $r['overtime_hours'], 'amount' => $b['amount'] + $r['amount']];
            }
            foreach ($byUser as $uid => $b) {
                DB::table('payment_statements')->insert([
                    'company_id' => $companyId, 'payment_period_id' => $periodId, 'user_id' => $uid,
                    'total_shifts' => $b['shifts'], 'overtime_hours' => round($b['ot'], 2), 'total_amount' => $b['amount'],
                    'status' => 'pending', 'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            Audit::record('payment_period', $periodId, 'created', $companyId, null, null, null,
                'Cierre '.$next['start_date'].' a '.$next['end_date'].' · '.$next['shifts'].' turnos · '.$next['amount']);

            return response()->json(['id' => $periodId], 201);
        });
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $period = $this->find($companyId, $id);

        $rows = DB::table('payment_statements as s')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('s.payment_period_id', $period->id)->where('s.company_id', $companyId)
            ->orderBy('u.first_name')->orderBy('u.last_name')
            ->get(['s.*', 'u.rut', 'u.first_name', 'u.last_name']);

        return response()->json([
            'period' => $this->periodApi($period),
            'data' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'rut' => Rut::format($r->rut),
                'first_name' => $r->first_name,
                'last_name' => $r->last_name,
                'shifts' => (int) $r->total_shifts,
                'overtime_hours' => (float) $r->overtime_hours,
                'amount' => (int) $r->total_amount,
                'status' => $r->status,
                'sent_at' => Time::iso($r->sent_at),
                'responded_at' => Time::iso($r->responded_at),
                'dispute_comment' => $r->dispute_comment,
                'admin_reply' => $r->admin_reply,
            ])->values(),
        ]);
    }

    /** Detalle (una línea por turno) de un resumen. */
    public function statement(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $st = DB::table('payment_statements')->where('id', $id)->where('company_id', $companyId)->first();
        abort_if(! $st, 404);

        return response()->json(['data' => Periods::lines((int) $st->payment_period_id, (int) $st->user_id)]);
    }

    /** Envía los resúmenes pendientes a los trabajadores. */
    public function send(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $period = $this->find($companyId, $id);
        $company = DB::table('companies')->where('id', $companyId)->first();

        $pending = DB::table('payment_statements')->where('payment_period_id', $period->id)->where('status', 'pending')->get();
        if ($pending->isEmpty()) {
            return response()->json(['message' => 'No hay resúmenes pendientes de envío.', 'code' => 'NOTHING_TO_SEND'], 422);
        }

        $now = now();
        DB::transaction(function () use ($period, $pending, $now) {
            DB::table('payment_statements')->whereIn('id', $pending->pluck('id'))
                ->update(['status' => 'sent', 'sent_at' => $now, 'updated_at' => $now]);
            DB::table('payment_periods')->where('id', $period->id)
                ->update(['status' => 'sent', 'sent_at' => $period->sent_at ?? $now, 'updated_at' => $now]);
        });

        foreach ($pending as $s) {
            PayNotifier::statementSent((int) $s->user_id, $companyId, $company->name, $period, (int) $s->total_shifts, (float) $s->overtime_hours, (int) $s->total_amount);
        }
        Audit::record('payment_period', $period->id, 'updated', $companyId, 'status', 'closed', 'sent', $pending->count().' resúmenes enviados');

        return response()->json(['sent' => $pending->count()]);
    }

    /** Simulación con fechas y filtros a elección. Solo lectura: no crea períodos ni cambia asistencias. */
    public function simulate(Request $request): JsonResponse
    {
        $v = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'user_id' => ['nullable', 'integer'],
            'location_id' => ['nullable', 'integer'],
            'rate' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:all,open,closed'],
        ]);
        if ((strtotime($v['to']) - strtotime($v['from'])) / 86400 > 366) {
            return response()->json(['message' => 'El rango no puede superar un año.', 'code' => 'RANGE_TOO_LONG'], 422);
        }

        $res = Periods::simulate((int) $request->user()->company_id, $v['from'], $v['to'], [
            'user_id' => (int) ($v['user_id'] ?? 0),
            'location_id' => (int) ($v['location_id'] ?? 0),
            'rate' => $v['rate'] ?? '',
            'status' => $v['status'] ?? 'all',
        ]);

        return response()->json(['from' => $v['from'], 'to' => $v['to']] + $res);
    }

    /** Todo el detalle del período (trabajadores con sus líneas) para armar el Excel. */
    public function detail(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $period = $this->find($companyId, $id);

        $sts = DB::table('payment_statements as s')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('s.payment_period_id', $period->id)->where('s.company_id', $companyId)
            ->orderBy('u.first_name')->orderBy('u.last_name')
            ->get(['s.user_id', 's.status', 'u.rut', 'u.first_name', 'u.last_name']);

        $data = $sts->map(fn ($s) => [
            'rut' => Rut::format($s->rut),
            'first_name' => $s->first_name,
            'last_name' => $s->last_name,
            'status' => $s->status,
            'lines' => Periods::lines((int) $period->id, (int) $s->user_id),
        ])->values();

        return response()->json(['period' => $this->periodApi($period), 'data' => $data]);
    }

    /** Deshace el cierre si nadie ha aceptado su resumen: libera las asistencias. */
    public function reopen(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $period = $this->find($companyId, $id);

        if (DB::table('payment_statements')->where('payment_period_id', $period->id)->where('status', 'accepted')->exists()) {
            return response()->json(['message' => 'Hay trabajadores que ya aceptaron su resumen; el período no se puede reabrir.', 'code' => 'HAS_ACCEPTED'], 409);
        }

        DB::transaction(function () use ($period, $companyId) {
            DB::table('attendances')->where('payment_period_id', $period->id)->update(['payment_period_id' => null, 'updated_at' => now()]);
            DB::table('payment_statements')->where('payment_period_id', $period->id)->delete();
            DB::table('payment_periods')->where('id', $period->id)->delete();
            Audit::record('payment_period', $period->id, 'deleted', $companyId, null, null, null,
                'Reapertura '.$period->start_date.' a '.$period->end_date);
        });

        return response()->json(['ok' => true]);
    }

    /** Responde el reclamo de un trabajador; el resumen vuelve a él para que lo acepte. */
    public function reply(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $data = $request->validate(['reply' => ['required', 'string', 'min:3', 'max:500']]);

        $st = DB::table('payment_statements')->where('id', $id)->where('company_id', $companyId)->first();
        abort_if(! $st, 404);
        if ($st->status !== 'disputed') {
            return response()->json(['message' => 'Este resumen no tiene un reclamo abierto.', 'code' => 'NOT_DISPUTED'], 409);
        }

        DB::table('payment_statements')->where('id', $st->id)->update([
            'admin_reply' => trim($data['reply']), 'replied_at' => now(), 'status' => 'sent', 'updated_at' => now(),
        ]);

        $period = DB::table('payment_periods')->where('id', $st->payment_period_id)->first();
        $company = DB::table('companies')->where('id', $companyId)->first();
        PayNotifier::replied((int) $st->user_id, $companyId, $company->name, $period, trim($data['reply']));
        Audit::record('payment_statement', $st->id, 'updated', $companyId, 'status', 'disputed', 'sent', 'Respuesta: '.trim($data['reply']));

        return response()->json(['ok' => true]);
    }

    /** CSV para Excel (separador ;) con el pago bruto por trabajador. */
    public function export(Request $request, int $id): StreamedResponse
    {
        $companyId = (int) $request->user()->company_id;
        $period = $this->find($companyId, $id);

        $rows = DB::table('payment_statements as s')
            ->join('users as u', 'u.id', '=', 's.user_id')
            ->where('s.payment_period_id', $period->id)->where('s.company_id', $companyId)
            ->orderBy('u.last_name')->orderBy('u.first_name')
            ->get(['u.rut', 'u.first_name', 'u.last_name', 's.total_shifts', 's.overtime_hours', 's.total_amount', 's.status']);

        $labels = ['pending' => 'Pendiente de envío', 'sent' => 'Enviado', 'accepted' => 'Aceptado', 'disputed' => 'En reclamo'];
        $name = 'pagos_'.$period->start_date.'_'.$period->end_date.'.csv';

        return response()->streamDownload(function () use ($rows, $labels) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['RUT', 'Nombre', 'Apellido', 'Turnos', 'Horas extra', 'Monto bruto', 'Estado'], ';');
            foreach ($rows as $r) {
                fputcsv($out, [Rut::format($r->rut), $r->first_name, $r->last_name, $r->total_shifts,
                    str_replace('.', ',', (string) $r->overtime_hours), $r->total_amount, $labels[$r->status] ?? $r->status], ';');
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function find(int $companyId, int $id): object
    {
        $p = DB::table('payment_periods')->where('id', $id)->where('company_id', $companyId)->first();
        abort_if(! $p, 404);

        return $p;
    }

    private function periodApi(object $p): array
    {
        return [
            'id' => (int) $p->id,
            'cycle' => $p->cycle,
            'start_date' => $p->start_date,
            'end_date' => $p->end_date,
            'status' => $p->status,
            'shifts' => (int) $p->total_shifts,
            'overtime_hours' => (float) $p->total_overtime_hours,
            'amount' => (int) $p->total_amount,
            'closed_at' => Time::iso($p->closed_at),
            'sent_at' => Time::iso($p->sent_at),
        ];
    }
}
