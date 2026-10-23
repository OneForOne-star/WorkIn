<?php

namespace App\Support;

use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Cierre de períodos de pago.
 * Un turno cuenta en el período que contiene su fecha de inicio (hora de Santiago).
 * Quincenal: 1-15 y 16-fin de mes. Mensual: el mes completo.
 */
final class Periods
{
    /** Rango [inicio, fin] (Y-m-d) del ciclo que contiene la fecha. */
    public static function rangeFor(string $date, string $cycle): array
    {
        $d = new DateTimeImmutable($date);
        $first = $d->modify('first day of this month');
        $last = $d->modify('last day of this month');

        if ($cycle === 'quincenal') {
            return (int) $d->format('j') <= 15
                ? [$first->format('Y-m-d'), $first->modify('+14 days')->format('Y-m-d')]
                : [$first->modify('+15 days')->format('Y-m-d'), $last->format('Y-m-d')];
        }

        return [$first->format('Y-m-d'), $last->format('Y-m-d')];
    }

    /** Mínimo de minutos de salida tardía sin autorizar para avisar (un tramo de horas extra). */
    public const LATE_ALERT_MINUTES = 15;

    /**
     * Minutos (en tramos de 15) que la persona salió después del término del turno y que aún no están
     * cubiertos por horas extra autorizadas. 0 si es menos que un tramo.
     */
    public static function lateMinutes(?string $endsAtUtc, ?string $checkOutUtc, float $authorizedHours): int
    {
        if (! $endsAtUtc || ! $checkOutUtc) {
            return 0;
        }
        $late = (strtotime($checkOutUtc.' UTC') - strtotime($endsAtUtc.' UTC')) / 60 - $authorizedHours * 60;
        $late = (int) (floor($late / 15) * 15);

        return $late >= self::LATE_ALERT_MINUTES ? $late : 0;
    }

    /**
     * Asistencias sin cerrar donde la salida fue tardía y las horas extra autorizadas no la cubren.
     * Las que ya tienen una solicitud pendiente no se listan: esa solicitud ya está en manos de la empresa.
     */
    public static function lateExits(int $companyId, ?array $attendanceIds = null): array
    {
        $q = DB::table('attendances as t')
            ->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->join('users as u', 'u.id', '=', 'a.user_id')
            ->where('t.company_id', $companyId)->whereNull('t.deleted_at')->whereNull('t.payment_period_id')
            ->whereNotNull('t.check_in_at')->whereNotNull('t.check_out_at')
            ->whereRaw('TIMESTAMPDIFF(MINUTE, s.ends_at, t.check_out_at) >= ?', [self::LATE_ALERT_MINUTES]);
        if ($attendanceIds !== null) {
            $q->whereIn('t.id', $attendanceIds ?: [0]);
        } else {
            $q->where('s.starts_at', '>=', gmdate('Y-m-d H:i:s', strtotime('-120 days')));
        }
        $rows = $q->orderByDesc('s.starts_at')->get(['t.id', 'u.rut', 'u.first_name', 'u.last_name', 's.title', 's.starts_at', 's.ends_at', 't.check_out_at']);
        if ($rows->isEmpty()) {
            return [];
        }

        $ids = $rows->pluck('id');
        $ot = DB::table('overtime_hours')->whereNull('deleted_at')->whereIn('attendance_id', $ids)
            ->groupBy('attendance_id')->selectRaw('attendance_id, SUM(hours) as h')->pluck('h', 'attendance_id');
        $pending = DB::table('overtime_requests')->where('status', 'pending')->whereIn('attendance_id', $ids)->pluck('attendance_id')->flip();

        $out = [];
        foreach ($rows as $r) {
            $late = self::lateMinutes($r->ends_at, $r->check_out_at, (float) ($ot[$r->id] ?? 0));
            if ($late > 0 && ! isset($pending[$r->id])) {
                $out[] = [
                    'attendance_id' => (int) $r->id,
                    'rut' => Rut::format($r->rut),
                    'worker' => trim($r->first_name.' '.$r->last_name),
                    'title' => $r->title ?: 'Turno',
                    'date' => self::localDate($r->starts_at),
                    'ends_at' => Time::iso($r->ends_at),
                    'check_out_at' => Time::iso($r->check_out_at),
                    'late_minutes' => $late,
                ];
            }
        }

        return $out;
    }

    /** Fecha (hora de Santiago) de un instante UTC guardado en la base. */
    public static function localDate(string $utc): string
    {
        return (new DateTimeImmutable($utc, new \DateTimeZone('UTC')))->setTimezone(Time::local())->format('Y-m-d');
    }

    public static function fmtDate(string $ymd): string
    {
        return (new DateTimeImmutable($ymd))->format('d-m-Y');
    }

    public static function clp(int $n): string
    {
        return '$'.number_format($n, 0, ',', '.');
    }

    /**
     * Asistencias completas (con entrada y salida) que aún no están en ningún período, con su monto.
     * Monto = pago del turno (tarifa fija de la oferta) + horas extra autorizadas x tarifa por hora extra.
     */
    public static function unassigned(int $companyId): array
    {
        $rows = DB::table('attendances as t')
            ->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->leftJoin('rates as r', 'r.id', '=', 't.rate_id')
            ->where('t.company_id', $companyId)
            ->whereNull('t.deleted_at')
            ->whereNull('t.payment_period_id')
            ->whereNotNull('t.check_in_at')
            ->whereNotNull('t.check_out_at')
            ->get([
                't.id', 'a.user_id', 's.starts_at',
                DB::raw('COALESCE(s.shift_amount, r.shift_amount, 0) as shift_amount'),
                DB::raw('COALESCE(s.overtime_hour_amount, r.overtime_hour_amount, 0) as ot_rate'),
            ]);

        $ot = DB::table('overtime_hours')->whereNull('deleted_at')
            ->whereIn('attendance_id', $rows->pluck('id'))
            ->groupBy('attendance_id')
            ->selectRaw('attendance_id, SUM(hours) as hours')
            ->pluck('hours', 'attendance_id');

        return $rows->map(function ($r) use ($ot) {
            $hours = round((float) ($ot[$r->id] ?? 0), 2);

            return [
                'id' => (int) $r->id,
                'user_id' => (int) $r->user_id,
                'date' => self::localDate($r->starts_at),
                'overtime_hours' => $hours,
                'amount' => (int) $r->shift_amount + (int) round($hours * (int) $r->ot_rate),
            ];
        })->all();
    }

    /** Siguiente período a cerrar para la empresa, o null si no hay nada pendiente. */
    public static function next(int $companyId, string $cycle): ?array
    {
        $rows = self::unassigned($companyId);
        if (! $rows) {
            return null;
        }

        $lastEnd = DB::table('payment_periods')->where('company_id', $companyId)->max('end_date');
        $dates = array_column($rows, 'date');

        if ($lastEnd === null) {
            $start = self::rangeFor(min($dates), $cycle)[0];
        } else {
            $after = array_filter($dates, fn ($d) => $d > $lastEnd);
            $afterLast = (new DateTimeImmutable($lastEnd))->modify('+1 day')->format('Y-m-d');
            $start = $after ? max($afterLast, self::rangeFor(min($after), $cycle)[0]) : $afterLast;
        }
        $end = self::rangeFor($start, $cycle)[1];

        $in = array_values(array_filter($rows, fn ($r) => $r['date'] <= $end));
        $incomplete = DB::table('attendances as t')
            ->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->where('t.company_id', $companyId)->whereNull('t.deleted_at')->whereNull('t.payment_period_id')
            ->whereNotNull('t.check_in_at')->whereNull('t.check_out_at')
            ->pluck('s.starts_at')
            ->filter(fn ($d) => self::localDate($d) <= $end)->count();

        return [
            'cycle' => $cycle,
            'start_date' => $start,
            'end_date' => $end,
            'can_close' => $end < Time::todayLocal(),
            'rows' => $in,
            'shifts' => count($in),
            'overtime_hours' => round(array_sum(array_column($in, 'overtime_hours')), 2),
            'amount' => (int) array_sum(array_column($in, 'amount')),
            'workers' => count(array_unique(array_column($in, 'user_id'))),
            'carried_over' => count(array_filter($in, fn ($r) => $r['date'] < $start)),
            'incomplete' => $incomplete,
        ];
    }

    /** Detalle de un resumen: una línea por turno trabajado. */
    public static function lines(int $periodId, int $userId): array
    {
        return array_column(self::build(fn ($q) => $q->where('t.payment_period_id', $periodId)->where('a.user_id', $userId)), 'line');
    }

    /** Detalle de varias asistencias agrupado por trabajador: [user_id => [líneas]]. */
    public static function linesByUser(array $attendanceIds): array
    {
        if (! $attendanceIds) {
            return [];
        }
        $out = [];
        foreach (self::build(fn ($q) => $q->whereIn('t.id', $attendanceIds)) as $r) {
            $out[$r['user_id']][] = $r['line'];
        }

        return $out;
    }

    /**
     * Una línea por turno con todo lo necesario para explicar el pago:
     * tarifa, horario del turno, lo que marcó, quién corrigió, horas extra autorizadas y cómo se llegó al monto.
     */
    private static function build(callable $scope): array
    {
        $q = DB::table('attendances as t')
            ->join('shift_assignments as a', 'a.id', '=', 't.shift_assignment_id')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->join('locations as l', 'l.id', '=', 's.location_id')
            ->leftJoin('rates as r', 'r.id', '=', 't.rate_id')
            ->leftJoin('users as cb', 'cb.id', '=', DB::raw('COALESCE(t.check_in_by, t.check_out_by)'))
            ->whereNull('t.deleted_at')
            ->orderBy('s.starts_at');
        $scope($q);

        $rows = $q->get([
            't.id', 'a.user_id', 't.check_in_at', 't.check_out_at', 't.check_in_method', 't.check_out_method', 't.comments as att_comments',
            't.payment_period_id', 's.location_id', 's.title', 's.starts_at', 's.ends_at', 's.is_night', 's.is_holiday', 'l.name as location_name',
            DB::raw('COALESCE(s.rate_name, r.name) as rate_name'),
            DB::raw('COALESCE(s.shift_amount, r.shift_amount, 0) as shift_amount'),
            DB::raw('COALESCE(s.overtime_hour_amount, r.overtime_hour_amount, 0) as ot_rate'),
            'cb.first_name as by_first', 'cb.last_name as by_last',
        ]);

        $ot = DB::table('overtime_hours as o')
            ->leftJoin('users as u', 'u.id', '=', 'o.authorized_by')
            ->whereNull('o.deleted_at')->whereIn('o.attendance_id', $rows->pluck('id'))
            ->orderBy('o.id')
            ->get(['o.attendance_id', 'o.hours', 'o.comments', 'u.first_name', 'u.last_name'])
            ->groupBy('attendance_id');

        $pendingReq = DB::table('overtime_requests')->where('status', 'pending')->whereIn('attendance_id', $rows->pluck('id'))->pluck('attendance_id')->flip();

        return $rows->map(function ($r) use ($ot, $pendingReq) {
            $entries = ($ot[$r->id] ?? collect())->map(fn ($o) => [
                'hours' => (float) $o->hours,
                'comment' => $o->comments,
                'authorized_by' => trim(($o->first_name ?? '').' '.($o->last_name ?? '')) ?: null,
            ])->values()->all();
            $hours = round(array_sum(array_column($entries, 'hours')), 2);
            $otAmount = (int) round($hours * (int) $r->ot_rate);
            $worked = ($r->check_in_at && $r->check_out_at)
                ? (int) round((strtotime($r->check_out_at.' UTC') - strtotime($r->check_in_at.' UTC')) / 60) : null;
            $manual = $r->check_in_method === 'manual' || $r->check_out_method === 'manual';

            return ['user_id' => (int) $r->user_id, 'line' => [
                'date' => self::localDate($r->starts_at),
                'location_id' => (int) $r->location_id,
                'closed' => $r->payment_period_id !== null,
                'title' => $r->title ?: 'Turno',
                'location' => $r->location_name,
                'rate_name' => $r->rate_name,
                'is_night' => (bool) $r->is_night,
                'is_holiday' => (bool) $r->is_holiday,
                'scheduled_start' => Time::iso($r->starts_at),
                'scheduled_end' => Time::iso($r->ends_at),
                'check_in_at' => Time::iso($r->check_in_at),
                'check_out_at' => Time::iso($r->check_out_at),
                'worked_minutes' => $worked,
                'manual' => $manual,
                'manual_by' => $manual ? (trim(($r->by_first ?? '').' '.($r->by_last ?? '')) ?: null) : null,
                'comment' => $r->att_comments,
                'shift_amount' => (int) $r->shift_amount,
                'overtime_rate' => (int) $r->ot_rate,
                'overtime' => $entries,
                'overtime_hours' => $hours,
                'overtime_amount' => $otAmount,
                'total' => (int) $r->shift_amount + $otAmount,
                'late_unauthorized_minutes' => self::lateMinutes($r->ends_at, $r->check_out_at, $hours),
                'has_pending_request' => isset($pendingReq[$r->id]),
            ]];
        })->all();
    }

    /**
     * Simulación: asistencias completas de turnos que empiezan entre dos fechas (hora de Santiago),
     * sin tocar nada. Devuelve líneas planas con el trabajador, más las opciones para filtrar.
     */
    public static function simulate(int $companyId, string $from, string $to, array $f): array
    {
        $local = Time::local();
        $utc = new \DateTimeZone('UTC');
        $a = (new DateTimeImmutable($from.' 00:00:00', $local))->setTimezone($utc)->format('Y-m-d H:i:s');
        $b = (new DateTimeImmutable($to.' 00:00:00', $local))->modify('+1 day')->setTimezone($utc)->format('Y-m-d H:i:s');

        $rows = self::build(function ($q) use ($companyId, $a, $b) {
            $q->where('t.company_id', $companyId)
                ->whereNotNull('t.check_in_at')->whereNotNull('t.check_out_at')
                ->where('s.starts_at', '>=', $a)->where('s.starts_at', '<', $b);
        });
        if ($f['status'] === 'open') {
            $rows = array_values(array_filter($rows, fn ($r) => ! $r['line']['closed']));
        } elseif ($f['status'] === 'closed') {
            $rows = array_values(array_filter($rows, fn ($r) => $r['line']['closed']));
        }

        $ids = array_values(array_unique(array_column($rows, 'user_id')));
        $users = DB::table('users')->whereIn('id', $ids)->get(['id', 'rut', 'first_name', 'last_name'])->keyBy('id');
        $locs = DB::table('locations')->whereIn('id', array_unique(array_map(fn ($r) => $r['line']['location_id'], $rows)))->pluck('name', 'id');

        $options = [
            'workers' => collect($ids)->map(fn ($id) => ['id' => $id, 'name' => trim($users[$id]->first_name.' '.$users[$id]->last_name)])->sortBy('name')->values()->all(),
            'locations' => collect($locs)->map(fn ($n, $id) => ['id' => (int) $id, 'name' => $n])->sortBy('name')->values()->all(),
            'rates' => array_values(array_unique(array_filter(array_map(fn ($r) => $r['line']['rate_name'], $rows)))),
        ];

        $rows = array_values(array_filter($rows, fn ($r) =>
            (! $f['user_id'] || $r['user_id'] === $f['user_id'])
            && (! $f['location_id'] || $r['line']['location_id'] === $f['location_id'])
            && (! $f['rate'] || $r['line']['rate_name'] === $f['rate'])));

        $lines = array_map(function ($r) use ($users) {
            $u = $users[$r['user_id']];

            return $r['line'] + ['user_id' => $r['user_id'], 'rut' => Rut::format($u->rut), 'worker' => trim($u->first_name.' '.$u->last_name)];
        }, $rows);

        return ['options' => $options, 'lines' => $lines];
    }

    /** Resumen de pago en formato API. $r viene de payment_statements unido a su período. */
    public static function statementApi(object $r): array
    {
        return [
            'id' => (int) $r->id,
            'period_id' => (int) $r->payment_period_id,
            'start_date' => $r->start_date,
            'end_date' => $r->end_date,
            'shifts' => (int) $r->total_shifts,
            'overtime_hours' => (float) $r->overtime_hours,
            'amount' => (int) $r->total_amount,
            'status' => $r->status,
            'sent_at' => Time::iso($r->sent_at),
            'responded_at' => Time::iso($r->responded_at),
            'dispute_comment' => $r->dispute_comment,
            'admin_reply' => $r->admin_reply,
        ];
    }
}
