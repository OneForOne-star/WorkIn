<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Disqualification;
use App\Models\Shift;
use App\Models\ShiftAssignment;
use App\Support\Audit;
use App\Support\BusinessRule;
use App\Support\Rut;
use App\Support\Time;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Postulaciones a un turno: la empresa decide a quién acepta. */
class ApplicationController extends Controller
{
    public function index(Request $request, int $shiftId): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $shift = Shift::forCompany($companyId)->findOrFail($shiftId);

        $rows = DB::table('shift_assignments as a')
            ->join('users as u', 'u.id', '=', 'a.user_id')
            ->leftJoin('company_workers as cw', fn ($j) => $j->on('cw.user_id', '=', 'a.user_id')->where('cw.company_id', '=', $companyId))
            ->leftJoin('attendances as t', fn ($j) => $j->on('t.shift_assignment_id', '=', 'a.id')->whereNull('t.deleted_at'))
            ->where('a.shift_id', $shift->id)->where('a.company_id', $companyId)
            ->orderByRaw("FIELD(a.status, 'accepted', 'applied', 'rejected', 'withdrawn', 'cancelled', 'no_show')")
            ->orderByRaw("FIELD(cw.priority, 'alta', 'media', 'baja')")
            ->orderBy('a.applied_at')
            ->get([
                'a.id', 'a.user_id', 'a.status', 'a.applied_at', 'a.decided_at',
                'u.rut', 'u.first_name', 'u.last_name', 'u.phone', 'cw.priority',
                't.id as attendance_id', 't.check_in_at', 't.check_out_at',
            ]);

        $accepted = $rows->where('status', 'accepted')->count();

        return response()->json([
            'shift' => ['id' => (int) $shift->id, 'slots' => $shift->slots, 'accepted_count' => $accepted, 'slots_left' => max(0, $shift->slots - $accepted)],
            'data' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'user_id' => (int) $r->user_id,
                'status' => $r->status,
                'rut' => Rut::format($r->rut),
                'first_name' => $r->first_name,
                'last_name' => $r->last_name,
                'phone' => $r->phone,
                'priority' => $r->priority,
                'applied_at' => Time::iso($r->applied_at),
                'decided_at' => Time::iso($r->decided_at),
                'attendance' => $r->attendance_id ? [
                    'id' => (int) $r->attendance_id,
                    'check_in_at' => Time::iso($r->check_in_at),
                    'check_out_at' => Time::iso($r->check_out_at),
                ] : null,
            ])->values(),
        ]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $admin = $request->user();
        $companyId = $admin->company_id;

        // Se valida que exista y sea de esta empresa antes de abrir la transacción.
        $probe = ShiftAssignment::forCompany($companyId)->findOrFail($id);

        try {
            DB::transaction(function () use ($probe, $admin, $companyId) {
                // Orden fijo de bloqueos (turno, luego trabajador) para que dos aceptaciones simultáneas
                // se turnen en vez de chocar: así los cupos y el choque de horarios se revisan uno a uno.
                $shift = DB::table('shifts')->where('id', $probe->shift_id)->where('company_id', $companyId)->lockForUpdate()->first();
                DB::table('users')->where('id', $probe->user_id)->lockForUpdate()->first();

                $a = ShiftAssignment::forCompany($companyId)->lockForUpdate()->findOrFail($probe->id);
                if ($a->status !== 'applied') {
                    throw new BusinessRule('Esta postulación ya fue resuelta.', 'INVALID_STATE');
                }
                if (! $shift || $shift->status !== 'published' || $shift->deleted_at !== null) {
                    throw new BusinessRule('El turno ya no está disponible.', 'SHIFT_UNAVAILABLE');
                }
                if ($shift->ends_at <= Time::toDb(Time::nowUtc())) {
                    throw new BusinessRule('El turno ya terminó.', 'SHIFT_UNAVAILABLE');
                }
                $inPool = DB::table('company_workers')->where('company_id', $companyId)
                    ->where('user_id', $a->user_id)->where('status', 'active')->exists();
                if (! $inPool) {
                    throw new BusinessRule('Esta persona ya no está activa en tu bolsa.', 'NOT_IN_POOL');
                }
                if (Disqualification::activeFor($companyId, (int) $a->user_id)) {
                    throw new BusinessRule('Esta persona está inhabilitada para tu empresa.', 'DISQUALIFIED');
                }

                $a->status = 'accepted';
                $a->decided_by = $admin->id;
                $a->decided_at = now();
                $a->save(); // los triggers de la base revisan choque de horario (todas las empresas) y cupos

                Audit::record('shift_assignment', $a->id, 'updated', $companyId, 'status', 'applied', 'accepted');
            });
        } catch (BusinessRule $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], $e->status);
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), 'SHIFT_OVERLAP')) {
                // A propósito no se dice con qué empresa ni qué turno choca.
                return response()->json([
                    'message' => 'Esta persona no está disponible en ese horario.',
                    'code' => 'SHIFT_OVERLAP',
                ], 409);
            }
            if (str_contains($e->getMessage(), 'SHIFT_FULL')) {
                return response()->json(['message' => 'Ya no quedan cupos en este turno.', 'code' => 'SHIFT_FULL'], 409);
            }
            throw $e;
        }

        return response()->json(['ok' => true, 'status' => 'accepted']);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $a = ShiftAssignment::forCompany($companyId)->findOrFail($id);

        if ($a->status !== 'applied') {
            return response()->json(['message' => 'Esta postulación ya fue resuelta.', 'code' => 'INVALID_STATE'], 409);
        }

        $a->status = 'rejected';
        $a->decided_by = $request->user()->id;
        $a->decided_at = now();
        $a->save();
        Audit::record('shift_assignment', $a->id, 'updated', $companyId, 'status', 'applied', 'rejected');

        return response()->json(['ok' => true, 'status' => 'rejected']);
    }

    /** La empresa retira a un trabajador ya aceptado (antes de que marque asistencia). */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $a = ShiftAssignment::forCompany($companyId)->findOrFail($id);

        if ($a->status !== 'accepted') {
            return response()->json(['message' => 'Solo se puede retirar a quien está aceptado.', 'code' => 'INVALID_STATE'], 409);
        }
        if (DB::table('attendances')->where('shift_assignment_id', $a->id)->whereNull('deleted_at')->exists()) {
            return response()->json(['message' => 'Esta persona ya marcó asistencia; no se puede retirar.', 'code' => 'HAS_ATTENDANCE'], 409);
        }

        $a->status = 'cancelled';
        $a->save();
        Audit::record('shift_assignment', $a->id, 'updated', $companyId, 'status', 'accepted', 'cancelled', 'Retirado por la empresa');

        return response()->json(['ok' => true, 'status' => 'cancelled']);
    }

    /** Marca como ausente a un aceptado cuyo turno ya empezó y no marcó entrada. */
    public function noShow(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $a = ShiftAssignment::forCompany($companyId)->with('shift')->findOrFail($id);

        if ($a->status !== 'accepted') {
            return response()->json(['message' => 'Solo se puede marcar ausente a quien está aceptado.', 'code' => 'INVALID_STATE'], 409);
        }
        if ($a->shift->starts_at > Time::nowUtc()) {
            return response()->json(['message' => 'El turno aún no empieza.', 'code' => 'SHIFT_NOT_STARTED'], 409);
        }
        if (DB::table('attendances')->where('shift_assignment_id', $a->id)->whereNull('deleted_at')->exists()) {
            return response()->json(['message' => 'Esta persona marcó asistencia.', 'code' => 'HAS_ATTENDANCE'], 409);
        }

        $a->status = 'no_show';
        $a->save();
        Audit::record('shift_assignment', $a->id, 'updated', $companyId, 'status', 'accepted', 'no_show');

        return response()->json(['ok' => true, 'status' => 'no_show']);
    }
}
