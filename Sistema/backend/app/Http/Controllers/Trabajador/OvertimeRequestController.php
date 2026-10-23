<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Support\Audit;
use App\Support\OvertimeNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** El trabajador pide horas extra por un turno ya marcado; la empresa decide. */
class OvertimeRequestController extends Controller
{
    /** $id es el id de la postulación (el mismo `id` de /mis-turnos). */
    public function store(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'hours' => ['required', 'numeric', 'min:0.25', 'max:12'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);
        $user = $request->user();

        $a = DB::table('shift_assignments as a')->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->where('a.id', $id)->where('a.user_id', $user->id)->where('a.status', 'accepted')
            ->first(['a.id', 's.title', 's.starts_at']);
        abort_if(! $a, 404);

        $att = DB::table('attendances')->where('shift_assignment_id', $a->id)->whereNull('deleted_at')->first();
        if (! $att || ! $att->check_in_at || ! $att->check_out_at) {
            return response()->json(['message' => 'Podrás pedir horas extra cuando hayas marcado tu entrada y tu salida.', 'code' => 'INCOMPLETE_ATTENDANCE'], 409);
        }
        if ($att->payment_period_id !== null) {
            return response()->json(['message' => 'El período de pago de este turno ya se cerró.', 'code' => 'PERIOD_CLOSED'], 409);
        }
        if (DB::table('overtime_requests')->where('attendance_id', $att->id)->where('status', 'pending')->exists()) {
            return response()->json(['message' => 'Ya tienes una solicitud pendiente por este turno.', 'code' => 'ALREADY_PENDING'], 409);
        }

        $hours = round((float) $data['hours'] * 4) / 4;
        $already = (float) DB::table('overtime_hours')->where('attendance_id', $att->id)->whereNull('deleted_at')->sum('hours');
        if ($already + $hours > 12) {
            return response()->json(['message' => 'Las horas extra de un turno no pueden superar 12 en total.', 'code' => 'OVERTIME_LIMIT'], 422);
        }

        $now = now();
        $reqId = DB::table('overtime_requests')->insertGetId([
            'company_id' => $att->company_id, 'attendance_id' => $att->id, 'user_id' => $user->id,
            'hours' => $hours, 'reason' => trim($data['reason']), 'status' => 'pending', 'created_at' => $now, 'updated_at' => $now,
        ]);
        Audit::record('overtime_request', $reqId, 'created', (int) $att->company_id, 'hours', null, $hours, trim($data['reason']));
        OvertimeNotifier::requested((int) $att->company_id, trim($user->first_name.' '.$user->last_name), $a->title ?: 'Turno', $a->starts_at, $hours, trim($data['reason']));

        return response()->json(['id' => $reqId], 201);
    }

    /** Retira una solicitud que aún no se ha respondido. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $r = DB::table('overtime_requests')->where('id', $id)->where('user_id', $request->user()->id)->first();
        abort_if(! $r, 404);
        if ($r->status !== 'pending') {
            return response()->json(['message' => 'Esta solicitud ya fue respondida.', 'code' => 'BAD_STATUS'], 409);
        }
        DB::table('overtime_requests')->where('id', $r->id)->update(['status' => 'cancelled', 'updated_at' => now()]);
        Audit::record('overtime_request', $r->id, 'updated', (int) $r->company_id, 'status', 'pending', 'cancelled');

        return response()->json(['ok' => true]);
    }
}
