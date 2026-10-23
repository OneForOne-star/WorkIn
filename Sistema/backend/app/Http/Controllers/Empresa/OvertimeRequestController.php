<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use App\Support\OvertimeNotifier;
use App\Support\Periods;
use App\Support\Rut;
use App\Support\Time;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Solicitudes de horas extra de los trabajadores y salidas tardías sin autorizar. */
class OvertimeRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;

        $rows = DB::table('overtime_requests as r')
            ->join('attendances as t', 't.id', '=', 'r.attendance_id')
            ->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->join('users as u', 'u.id', '=', 'r.user_id')
            ->where('r.company_id', $companyId)->where('r.status', 'pending')
            ->orderBy('r.created_at')
            ->get(['r.id', 'r.attendance_id', 'r.hours', 'r.reason', 'r.created_at', 'u.rut', 'u.first_name', 'u.last_name',
                's.id as shift_id', 's.title', 's.starts_at', 's.ends_at', 't.check_in_at', 't.check_out_at']);

        $auth = DB::table('overtime_hours')->whereNull('deleted_at')->whereIn('attendance_id', $rows->pluck('attendance_id'))
            ->groupBy('attendance_id')->selectRaw('attendance_id, SUM(hours) as h')->pluck('h', 'attendance_id');

        return response()->json([
            'requests' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'shift_id' => (int) $r->shift_id,
                'worker' => trim($r->first_name.' '.$r->last_name),
                'rut' => Rut::format($r->rut),
                'title' => $r->title ?: 'Turno',
                'date' => Periods::localDate($r->starts_at),
                'ends_at' => Time::iso($r->ends_at),
                'check_in_at' => Time::iso($r->check_in_at),
                'check_out_at' => Time::iso($r->check_out_at),
                'hours' => (float) $r->hours,
                'reason' => $r->reason,
                'authorized_hours' => round((float) ($auth[$r->attendance_id] ?? 0), 2),
                'created_at' => Time::iso($r->created_at),
            ])->values(),
            'late_exits' => Periods::lateExits($companyId),
        ]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $admin = $request->user();
        $companyId = (int) $admin->company_id;
        $data = $request->validate([
            'hours' => ['nullable', 'numeric', 'min:0.25', 'max:12'],
            'comment' => ['nullable', 'string', 'max:255'],
        ]);

        $result = DB::transaction(function () use ($id, $companyId, $admin, $data) {
            $r = DB::table('overtime_requests')->where('id', $id)->where('company_id', $companyId)->lockForUpdate()->first();
            abort_if(! $r, 404);
            if ($r->status !== 'pending') {
                return response()->json(['message' => 'Esta solicitud ya fue respondida.', 'code' => 'BAD_STATUS'], 409);
            }
            $att = DB::table('attendances')->where('id', $r->attendance_id)->where('company_id', $companyId)->whereNull('deleted_at')->first();
            if (! $att || $att->payment_period_id !== null) {
                return response()->json(['message' => 'El período de pago de este turno ya se cerró.', 'code' => 'PERIOD_CLOSED'], 409);
            }

            $hours = round((float) ($data['hours'] ?? $r->hours) * 4) / 4;
            $already = (float) DB::table('overtime_hours')->where('attendance_id', $att->id)->whereNull('deleted_at')->sum('hours');
            if ($already + $hours > 12) {
                return response()->json(['message' => 'Las horas extra de un turno no pueden superar 12 en total.', 'code' => 'OVERTIME_LIMIT'], 422);
            }

            $now = now();
            $otId = DB::table('overtime_hours')->insertGetId([
                'company_id' => $companyId, 'attendance_id' => $att->id, 'hours' => $hours,
                'authorized_by' => $admin->id, 'authorized_at' => $now,
                'comments' => mb_substr('Pedidas por el trabajador: '.$r->reason, 0, 255),
                'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('overtime_requests')->where('id', $r->id)->update([
                'status' => 'approved', 'resolved_by' => $admin->id, 'resolved_at' => $now,
                'resolution_comment' => $data['comment'] ?? null, 'overtime_hour_id' => $otId, 'updated_at' => $now,
            ]);
            Audit::record('overtime_hour', $otId, 'created', $companyId, 'hours', null, $hours, 'Solicitud #'.$r->id);
            Audit::record('overtime_request', $r->id, 'updated', $companyId, 'status', 'pending', 'approved', $data['comment'] ?? null);

            return ['request' => $r, 'hours' => $hours];
        });
        if ($result instanceof JsonResponse) {
            return $result;
        }

        $this->tell($result['request'], $companyId, true, $result['hours'], $data['comment'] ?? null);

        return response()->json(['ok' => true]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $companyId = (int) $request->user()->company_id;
        $data = $request->validate(['comment' => ['required', 'string', 'min:3', 'max:255']]);

        $r = DB::table('overtime_requests')->where('id', $id)->where('company_id', $companyId)->first();
        abort_if(! $r, 404);
        $changed = DB::table('overtime_requests')->where('id', $r->id)->where('status', 'pending')->update([
            'status' => 'rejected', 'resolved_by' => $request->user()->id, 'resolved_at' => now(),
            'resolution_comment' => trim($data['comment']), 'updated_at' => now(),
        ]);
        if (! $changed) {
            return response()->json(['message' => 'Esta solicitud ya fue respondida.', 'code' => 'BAD_STATUS'], 409);
        }
        Audit::record('overtime_request', $r->id, 'updated', $companyId, 'status', 'pending', 'rejected', trim($data['comment']));
        $this->tell($r, $companyId, false, (float) $r->hours, trim($data['comment']));

        return response()->json(['ok' => true]);
    }

    private function tell(object $r, int $companyId, bool $approved, float $hours, ?string $comment): void
    {
        $info = DB::table('attendances as t')->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')->where('t.id', $r->attendance_id)->first(['s.title', 's.starts_at']);
        $company = DB::table('companies')->where('id', $companyId)->value('name');
        if ($info) {
            OvertimeNotifier::resolved((int) $r->user_id, $companyId, (string) $company, $info->title ?: 'Turno', $info->starts_at, $approved, $hours, $comment);
        }
    }
}
