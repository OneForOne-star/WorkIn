<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Models\CompanyWorker;
use App\Support\Audit;
use App\Support\Time;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** El trabajador responde invitaciones y administra a qué bolsas pertenece. */
class PoolController extends Controller
{
    /** Invitaciones pendientes. */
    public function invitations(Request $request): JsonResponse
    {
        $rows = CompanyWorker::where('user_id', $request->user()->id)
            ->where('status', 'invited')->with('company')->orderByDesc('invited_at')->get();

        return response()->json(['data' => $rows->map(fn (CompanyWorker $cw) => [
            'id' => (int) $cw->id,
            'company' => $cw->company?->name,
            'invited_at' => Time::iso($cw->invited_at),
        ])->values()]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $cw = $this->invitation($request, $id);

        if ($cw->company?->status !== 'active') {
            return response()->json(['message' => 'Esta empresa no está disponible por ahora.', 'code' => 'COMPANY_INACTIVE'], 409);
        }

        $cw->status = 'active';
        $cw->responded_at = now();
        $cw->save();
        Audit::record('company_worker', $cw->id, 'updated', (int) $cw->company_id, 'status', 'invited', 'active', 'Aceptó la invitación');

        return response()->json(['ok' => true, 'status' => 'active']);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $cw = $this->invitation($request, $id);

        $cw->status = 'declined';
        $cw->responded_at = now();
        $cw->save();
        Audit::record('company_worker', $cw->id, 'updated', (int) $cw->company_id, 'status', 'invited', 'declined', 'Rechazó la invitación');

        return response()->json(['ok' => true, 'status' => 'declined']);
    }

    /** Empresas a las que pertenece. */
    public function companies(Request $request): JsonResponse
    {
        $rows = CompanyWorker::where('user_id', $request->user()->id)
            ->whereIn('status', ['active', 'inactive'])->with('company')->get();

        return response()->json(['data' => $rows->map(fn (CompanyWorker $cw) => [
            'id' => (int) $cw->id,
            'company' => $cw->company?->name,
            'status' => $cw->status,
            'since' => Time::iso($cw->responded_at),
        ])->values()]);
    }

    /** Salir de la bolsa de una empresa. */
    public function leave(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;
        $cw = CompanyWorker::where('user_id', $userId)->whereIn('status', ['active', 'inactive'])->findOrFail($id);

        $now = Time::toDb(Time::nowUtc());
        $future = DB::table('shift_assignments as a')->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->where('a.user_id', $userId)->where('a.company_id', $cw->company_id)
            ->where('s.ends_at', '>', $now)->whereNull('s.deleted_at');

        if ((clone $future)->where('a.status', 'accepted')->exists()) {
            return response()->json([
                'message' => 'Tienes turnos aceptados con esta empresa. Cuando termine el último o los canceles podrás salir.',
                'code' => 'HAS_ACCEPTED_SHIFTS',
            ], 409);
        }

        DB::transaction(function () use ($cw, $future, $userId) {
            $ids = (clone $future)->where('a.status', 'applied')->pluck('a.id');
            DB::table('shift_assignments')->whereIn('id', $ids)
                ->update(['status' => 'withdrawn', 'withdrawn_at' => now(), 'updated_at' => now()]);
            $cw->status = 'left';
            $cw->responded_at = now();
            $cw->save();
            Audit::record('company_worker', $cw->id, 'updated', (int) $cw->company_id, 'status', null, 'left', 'El trabajador salió de la bolsa');
        });

        return response()->json(['ok' => true]);
    }

    private function invitation(Request $request, int $id): CompanyWorker
    {
        return CompanyWorker::where('user_id', $request->user()->id)
            ->where('status', 'invited')->with('company')->findOrFail($id);
    }
}
