<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\OvertimeHour;
use App\Models\Rate;
use App\Models\ShiftAssignment;
use App\Support\Audit;
use App\Support\Rut;
use App\Support\Time;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Asistencia del turno: lo que marcó la gente, correcciones manuales y horas extra autorizadas. */
class AttendanceController extends Controller
{
    /** Aceptados de un turno con su asistencia y horas extra. */
    public function byShift(Request $request, int $shiftId): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $shift = DB::table('shifts')->where('id', $shiftId)->where('company_id', $companyId)->whereNull('deleted_at')->first();
        abort_if(! $shift, 404);

        $rows = DB::table('shift_assignments as a')
            ->join('users as u', 'u.id', '=', 'a.user_id')
            ->leftJoin('attendances as t', fn ($j) => $j->on('t.shift_assignment_id', '=', 'a.id')->whereNull('t.deleted_at'))
            ->where('a.shift_id', $shift->id)->where('a.company_id', $companyId)
            ->whereIn('a.status', ['accepted', 'no_show'])
            ->orderBy('u.first_name')
            ->get(['a.id as assignment_id', 'a.status', 'u.rut', 'u.first_name', 'u.last_name',
                't.id as attendance_id', 't.check_in_at', 't.check_in_method', 't.check_out_at', 't.check_out_method',
                't.comments', 't.payment_period_id']);

        $overtime = DB::table('overtime_hours')->whereNull('deleted_at')
            ->whereIn('attendance_id', $rows->pluck('attendance_id')->filter())
            ->get(['id', 'attendance_id', 'hours', 'comments'])->groupBy('attendance_id');

        $requests = DB::table('overtime_requests')->where('status', 'pending')
            ->whereIn('attendance_id', $rows->pluck('attendance_id')->filter())
            ->get(['id', 'attendance_id', 'hours', 'reason'])->keyBy('attendance_id');

        $shiftAmount = (int) ($shift->shift_amount ?? 0);
        $otAmount = (int) ($shift->overtime_hour_amount ?? 0);
        $completed = $rows->filter(fn ($r) => $r->check_in_at && $r->check_out_at)->count();
        $otHours = round((float) $overtime->flatten(1)->sum('hours'), 2);

        return response()->json([
            // Lo que cuesta este turno con la tarifa fija de la oferta (turnos completos + horas extra autorizadas).
            'summary' => [
                'completed_count' => $completed,
                'overtime_hours' => $otHours,
                'shift_amount' => $shiftAmount,
                'overtime_hour_amount' => $otAmount,
                'shifts_total' => $completed * $shiftAmount,
                'overtime_total' => (int) round($otHours * $otAmount),
                'total' => $completed * $shiftAmount + (int) round($otHours * $otAmount),
            ],
            'data' => $rows->map(function ($r) use ($overtime, $requests, $shift) {
            $ot = $r->attendance_id ? ($overtime[$r->attendance_id] ?? collect()) : collect();

            return [
                'assignment_id' => (int) $r->assignment_id,
                'status' => $r->status,
                'rut' => Rut::format($r->rut),
                'first_name' => $r->first_name,
                'last_name' => $r->last_name,
                'attendance_id' => $r->attendance_id ? (int) $r->attendance_id : null,
                'check_in_at' => Time::iso($r->check_in_at),
                'check_in_method' => $r->check_in_method,
                'check_out_at' => Time::iso($r->check_out_at),
                'check_out_method' => $r->check_out_method,
                'comments' => $r->comments,
                'locked' => $r->payment_period_id !== null,
                'overtime_hours' => round((float) $ot->sum('hours'), 2),
                'late_minutes' => ($r->attendance_id && ! isset($requests[$r->attendance_id]))
                    ? \App\Support\Periods::lateMinutes($shift->ends_at, $r->check_out_at, round((float) $ot->sum('hours'), 2)) : 0,
                'request' => isset($requests[$r->attendance_id]) ? ['id' => (int) $requests[$r->attendance_id]->id, 'hours' => (float) $requests[$r->attendance_id]->hours, 'reason' => $requests[$r->attendance_id]->reason] : null,
                'overtime' => $ot->map(fn ($o) => ['id' => (int) $o->id, 'hours' => (float) $o->hours, 'comments' => $o->comments])->values(),
            ];
        })->values()]);
    }

    /**
     * Registro manual de respaldo (se cayó el QR, olvidó el celular, etc.).
     * Crea la asistencia o corrige las horas; siempre exige un motivo y queda auditado.
     */
    public function manual(Request $request, int $assignmentId): JsonResponse
    {
        $admin = $request->user();
        $companyId = $admin->company_id;

        $assignment = ShiftAssignment::forCompany($companyId)->with('shift')->findOrFail($assignmentId);
        if ($assignment->status !== 'accepted') {
            return response()->json(['message' => 'Solo se registra asistencia de trabajadores aceptados.', 'code' => 'INVALID_STATE'], 409);
        }

        $data = $request->validate([
            'check_in_at' => ['nullable', 'string'],
            'check_out_at' => ['nullable', 'string'],
            'comments' => ['required', 'string', 'min:3', 'max:255'],
        ]);
        if (empty($data['check_in_at']) && empty($data['check_out_at'])) {
            throw ValidationException::withMessages(['check_in_at' => ['Indica al menos la hora de entrada o de salida.']]);
        }

        $in = ! empty($data['check_in_at']) ? $this->parse($data['check_in_at'], 'check_in_at') : null;
        $out = ! empty($data['check_out_at']) ? $this->parse($data['check_out_at'], 'check_out_at') : null;

        // Las horas deben estar cerca del turno (±12 h) para evitar errores de tipeo.
        $min = $assignment->shift->starts_at->copy()->subHours(12);
        $max = $assignment->shift->ends_at->copy()->addHours(12);
        foreach (['check_in_at' => $in, 'check_out_at' => $out] as $field => $dt) {
            if ($dt && ($dt < $min || $dt > $max)) {
                throw ValidationException::withMessages([$field => ['La hora está demasiado lejos del turno. Revísala.']]);
            }
        }
        if ($in && $out && $out <= $in) {
            throw ValidationException::withMessages(['check_out_at' => ['La salida debe ser posterior a la entrada.']]);
        }

        $att = Attendance::forCompany($companyId)->where('shift_assignment_id', $assignment->id)->first();
        if ($att && $att->payment_period_id !== null) {
            return response()->json(['message' => 'El período de pago de esta asistencia ya se cerró.', 'code' => 'PERIOD_CLOSED'], 409);
        }

        try {
            DB::transaction(function () use (&$att, $assignment, $companyId, $admin, $in, $out, $data) {
                $created = false;
                if (! $att) {
                    $rate = $assignment->shift->rate_id
                        ? Rate::find($assignment->shift->rate_id)
                        : Rate::resolveFor($companyId, (int) $assignment->user_id);
                    if (! $rate) {
                        throw new \App\Support\BusinessRule('La empresa no tiene una tarifa vigente. Crea una en Tarifas.', 'NO_RATE');
                    }
                    $att = new Attendance;
                    $att->company_id = $companyId;
                    $att->shift_assignment_id = $assignment->id;
                    $att->rate_id = $rate->id;
                    $created = true;
                }

                $before = [
                    'check_in_at' => $att->check_in_at ? Time::toDb($att->check_in_at) : null,
                    'check_out_at' => $att->check_out_at ? Time::toDb($att->check_out_at) : null,
                ];
                if ($in) {
                    $att->check_in_at = Time::toDb($in);
                    $att->check_in_method = 'manual';
                    $att->check_in_by = $admin->id;
                }
                if ($out) {
                    $att->check_out_at = Time::toDb($out);
                    $att->check_out_method = 'manual';
                    $att->check_out_by = $admin->id;
                }
                $att->comments = $data['comments'];
                $att->save();

                if ($created) {
                    Audit::record('attendance', $att->id, 'created', $companyId, null, null, null, 'Registro manual: '.$data['comments']);
                }
                foreach (['check_in_at' => $in, 'check_out_at' => $out] as $field => $dt) {
                    if ($dt) {
                        Audit::record('attendance', $att->id, 'updated', $companyId, $field, $before[$field], Time::toDb($dt), $data['comments']);
                    }
                }
            });
        } catch (\App\Support\BusinessRule $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], $e->status);
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), 'ck_att_order')) {
                return response()->json(['message' => 'La salida debe ser posterior a la entrada ya registrada.', 'code' => 'BAD_ORDER'], 422);
            }
            throw $e;
        }

        return response()->json(['attendance' => $att->fresh()->toApi()], 201);
    }

    /** Autoriza horas extra sobre una asistencia. */
    public function addOvertime(Request $request, int $attendanceId): JsonResponse
    {
        $admin = $request->user();
        $companyId = $admin->company_id;
        $att = Attendance::forCompany($companyId)->findOrFail($attendanceId);

        $data = $request->validate([
            'hours' => ['required', 'numeric', 'min:0.25', 'max:12'],
            'comments' => ['nullable', 'string', 'max:255'],
        ]);

        if ($att->payment_period_id !== null) {
            return response()->json(['message' => 'El período de pago de esta asistencia ya se cerró.', 'code' => 'PERIOD_CLOSED'], 409);
        }
        if (! $att->check_in_at || ! $att->check_out_at) {
            return response()->json(['message' => 'La asistencia debe tener entrada y salida antes de autorizar horas extra.', 'code' => 'INCOMPLETE_ATTENDANCE'], 409);
        }

        $hours = round((float) $data['hours'] * 4) / 4; // en tramos de 15 minutos
        $already = (float) DB::table('overtime_hours')->where('attendance_id', $att->id)->whereNull('deleted_at')->sum('hours');
        if ($already + $hours > 12) {
            return response()->json(['message' => 'Las horas extra de un turno no pueden superar 12 en total.', 'code' => 'OVERTIME_LIMIT'], 422);
        }

        $ot = new OvertimeHour;
        $ot->company_id = $companyId;
        $ot->attendance_id = $att->id;
        $ot->hours = $hours;
        $ot->authorized_by = $admin->id;
        $ot->authorized_at = now();
        $ot->comments = $data['comments'] ?? null;
        $ot->save();
        Audit::record('overtime_hour', $ot->id, 'created', $companyId, 'hours', null, $hours, $ot->comments);

        return response()->json(['overtime' => $ot->toApi()], 201);
    }

    public function removeOvertime(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $ot = OvertimeHour::where('company_id', $companyId)->findOrFail($id);

        $att = Attendance::forCompany($companyId)->findOrFail($ot->attendance_id);
        if ($att->payment_period_id !== null) {
            return response()->json(['message' => 'El período de pago de esta asistencia ya se cerró.', 'code' => 'PERIOD_CLOSED'], 409);
        }

        $ot->delete();
        Audit::record('overtime_hour', $ot->id, 'deleted', $companyId, 'hours', $ot->hours, null);

        return response()->json(['ok' => true]);
    }

    private function parse(string $value, string $field): \DateTimeImmutable
    {
        try {
            return Time::parse($value);
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages([$field => ['Fecha u hora inválida.']]);
        }
    }
}
