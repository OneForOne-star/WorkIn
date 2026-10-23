<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Support\Time;
use App\Support\Windows;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Los turnos del trabajador: postulados, aceptados y pasados. */
class MyShiftsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['scope' => ['nullable', 'in:upcoming,past']]);
        $userId = $request->user()->id;
        $now = Time::toDb(Time::nowUtc());
        $past = $request->input('scope') === 'past';

        $rows = DB::table('shift_assignments as a')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->join('companies as c', 'c.id', '=', 's.company_id')
            ->join('locations as l', 'l.id', '=', 's.location_id')
            ->leftJoin('attendances as t', fn ($j) => $j->on('t.shift_assignment_id', '=', 'a.id')->whereNull('t.deleted_at'))
            ->where('a.user_id', $userId)
            ->whereNull('s.deleted_at')
            ->when($past, fn ($q) => $q->where('s.ends_at', '<', $now)->orderByDesc('s.starts_at'),
                fn ($q) => $q->where('s.ends_at', '>=', $now)->orderBy('s.starts_at'))
            ->limit(100)
            ->get([
                'a.id', 'a.status', 's.id as shift_id', 's.title', 's.starts_at', 's.ends_at', 's.status as shift_status',
                's.is_night', 's.is_holiday', 's.shift_amount', 's.overtime_hour_amount', 'c.name as company_name', 'l.name as location_name', 'l.address as location_address',
                't.id as attendance_id', 't.payment_period_id', 't.check_in_at', 't.check_out_at',
            ]);

        $attIds = $rows->pluck('attendance_id')->filter()->values();
        $authorized = DB::table('overtime_hours')->whereNull('deleted_at')->whereIn('attendance_id', $attIds)
            ->groupBy('attendance_id')->selectRaw('attendance_id, SUM(hours) as h')->pluck('h', 'attendance_id');
        $requests = DB::table('overtime_requests')->whereIn('attendance_id', $attIds)->where('status', '!=', 'cancelled')
            ->orderBy('id')->get(['id', 'attendance_id', 'hours', 'reason', 'status', 'resolution_comment'])->keyBy('attendance_id');

        $m = Windows::MINUTES;

        return response()->json(['data' => $rows->map(function ($r) use ($m, $authorized, $requests) {
            $start = new \DateTimeImmutable($r->starts_at, new \DateTimeZone('UTC'));
            $end = new \DateTimeImmutable($r->ends_at, new \DateTimeZone('UTC'));

            return [
                'id' => (int) $r->id,
                'status' => $r->status,
                'shift_status' => $r->shift_status,
                'company' => $r->company_name,
                'title' => $r->title,
                'location' => ['name' => $r->location_name, 'address' => $r->location_address],
                'starts_at' => Time::iso($r->starts_at),
                'ends_at' => Time::iso($r->ends_at),
                'is_night' => (bool) $r->is_night,
                'is_holiday' => (bool) $r->is_holiday,
                'pay' => [
                    'shift_amount' => $r->shift_amount === null ? null : (int) $r->shift_amount,
                    'overtime_hour_amount' => $r->overtime_hour_amount === null ? null : (int) $r->overtime_hour_amount,
                ],
                'check_in_at' => Time::iso($r->check_in_at),
                'check_out_at' => Time::iso($r->check_out_at),
                'overtime' => [
                    'authorized_hours' => round((float) ($authorized[$r->attendance_id] ?? 0), 2),
                    'request' => isset($requests[$r->attendance_id]) ? [
                        'id' => (int) $requests[$r->attendance_id]->id, 'hours' => (float) $requests[$r->attendance_id]->hours,
                        'reason' => $requests[$r->attendance_id]->reason, 'status' => $requests[$r->attendance_id]->status,
                        'resolution_comment' => $requests[$r->attendance_id]->resolution_comment,
                    ] : null,
                    'can_request' => $r->status === 'accepted' && $r->check_in_at && $r->check_out_at && $r->payment_period_id === null
                        && (! isset($requests[$r->attendance_id]) || $requests[$r->attendance_id]->status !== 'pending'),
                ],
                'windows' => [
                    'check_in_opens_at' => Time::iso($start->modify("-{$m} minutes")),
                    'check_in_closes_at' => Time::iso($start->modify("+{$m} minutes")),
                    'check_out_opens_at' => Time::iso($end->modify("-{$m} minutes")),
                    'check_out_closes_at' => Time::iso($end->modify("+{$m} minutes")),
                ],
            ];
        })->values()]);
    }
}
