<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Models\ShiftAssignment;
use App\Support\Audit;
use App\Support\BusinessRule;
use App\Support\Offers;
use App\Support\Time;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Ofertas que ve el trabajador (de todas las empresas que lo tienen en su bolsa) y sus postulaciones. */
class OfferController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $rows = Offers::visibleTo($userId)
            ->leftJoin('shift_assignments as a', fn ($j) => $j->on('a.shift_id', '=', 's.id')->where('a.user_id', '=', $userId))
            ->selectRaw('s.id, s.title, s.notes, s.starts_at, s.ends_at, s.slots, s.is_night, s.is_holiday,
                s.shift_amount, s.overtime_hour_amount,
                c.name as company_name, l.name as location_name, l.address as location_address,
                a.id as assignment_id, a.status as my_status,
                (SELECT COUNT(*) FROM shift_assignments x WHERE x.shift_id = s.id AND x.status = \'accepted\') AS accepted_count,
                EXISTS (SELECT 1 FROM shift_assignments o JOIN shifts os ON os.id = o.shift_id
                         WHERE o.user_id = cw.user_id AND o.status = \'accepted\'
                           AND os.deleted_at IS NULL AND os.status <> \'cancelled\'
                           AND os.id <> s.id AND os.starts_at < s.ends_at AND s.starts_at < os.ends_at) AS overlaps')
            ->orderBy('s.starts_at')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'company' => $r->company_name,
                'title' => $r->title,
                'notes' => $r->notes,
                'location' => ['name' => $r->location_name, 'address' => $r->location_address],
                'starts_at' => Time::iso($r->starts_at),
                'ends_at' => Time::iso($r->ends_at),
                'is_night' => (bool) $r->is_night,
                'is_holiday' => (bool) $r->is_holiday,
                'pay' => [
                    'shift_amount' => $r->shift_amount === null ? null : (int) $r->shift_amount,
                    'overtime_hour_amount' => $r->overtime_hour_amount === null ? null : (int) $r->overtime_hour_amount,
                ],
                'slots_left' => max(0, (int) $r->slots - (int) $r->accepted_count),
                'my_status' => $r->my_status,
                'assignment_id' => $r->assignment_id ? (int) $r->assignment_id : null,
                'overlaps_my_shifts' => (bool) $r->overlaps,
            ])->values(),
        ]);
    }

    public function apply(Request $request, int $shiftId): JsonResponse
    {
        $userId = $request->user()->id;

        try {
            $result = DB::transaction(function () use ($userId, $shiftId) {
                $shift = Offers::visibleTo($userId)->where('s.id', $shiftId)->select('s.id', 's.company_id', 's.slots')->first();
                if (! $shift) {
                    // No existe, no está publicado o no está en tu bolsa: es lo mismo para quien consulta.
                    throw new BusinessRule('Esta oferta ya no está disponible.', 'OFFER_UNAVAILABLE', 404);
                }

                $accepted = DB::table('shift_assignments')->where('shift_id', $shift->id)->where('status', 'accepted')->count();
                if ($accepted >= (int) $shift->slots) {
                    throw new BusinessRule('Ya no quedan cupos en este turno.', 'SHIFT_FULL');
                }

                $a = ShiftAssignment::where('shift_id', $shift->id)->where('user_id', $userId)->lockForUpdate()->first();
                if ($a) {
                    if ($a->status === 'applied' || $a->status === 'accepted') {
                        throw new BusinessRule('Ya postulaste a este turno.', 'ALREADY_APPLIED');
                    }
                    if ($a->status !== 'withdrawn') {
                        throw new BusinessRule('No puedes volver a postular a este turno.', 'CANNOT_REAPPLY');
                    }
                    $a->status = 'applied';
                    $a->applied_at = now();
                    $a->withdrawn_at = null;
                    $a->decided_by = null;
                    $a->decided_at = null;
                } else {
                    $a = new ShiftAssignment;
                    $a->company_id = $shift->company_id;
                    $a->shift_id = $shift->id;
                    $a->user_id = $userId;
                    $a->status = 'applied';
                    $a->applied_at = now();
                }
                $a->save();

                return $a;
            });
        } catch (BusinessRule $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->errorCode], $e->status);
        }

        return response()->json(['assignment_id' => (int) $result->id, 'status' => 'applied'], 201);
    }

    /** Retirar una postulación, o un turno aceptado con anticipación suficiente. */
    public function withdraw(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;
        $a = ShiftAssignment::where('user_id', $userId)->with('shift')->findOrFail($id);

        if (! in_array($a->status, ['applied', 'accepted'], true)) {
            return response()->json(['message' => 'Esta postulación ya no se puede retirar.', 'code' => 'INVALID_STATE'], 409);
        }

        if ($a->status === 'accepted') {
            if (DB::table('attendances')->where('shift_assignment_id', $a->id)->whereNull('deleted_at')->exists()) {
                return response()->json(['message' => 'Ya marcaste asistencia en este turno.', 'code' => 'HAS_ATTENDANCE'], 409);
            }
            $hours = (int) config('workin.worker_cancel_hours');
            $limit = Time::nowUtc()->modify("+{$hours} hours");
            if ($a->shift->starts_at < $limit) {
                return response()->json([
                    'message' => "Faltan menos de {$hours} horas para el turno. Comunícate con la empresa para avisar que no puedes asistir.",
                    'code' => 'TOO_LATE_TO_WITHDRAW',
                ], 409);
            }
        }

        $old = $a->status;
        $a->status = 'withdrawn';
        $a->withdrawn_at = now();
        $a->save();
        Audit::record('shift_assignment', $a->id, 'updated', (int) $a->company_id, 'status', $old, 'withdrawn');

        return response()->json(['ok' => true, 'status' => 'withdrawn']);
    }
}
