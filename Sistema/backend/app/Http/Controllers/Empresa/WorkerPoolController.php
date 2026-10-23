<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\CompanyWorker;
use App\Models\Disqualification;
use App\Models\Rate;
use App\Models\User;
use App\Notifications\WorkerInvitedNotification;
use App\Support\Audit;
use App\Support\Rut;
use App\Support\Time;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Bolsa de trabajadores de la empresa. */
class WorkerPoolController extends Controller
{
    /** Búsquedas de RUT sin resultado permitidas por administrador cada 24 horas. */
    public const MAX_MISSES = 5;

    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;

        $request->validate([
            'status' => ['nullable', 'in:invited,active,declined,inactive,left'],
            'q' => ['nullable', 'string', 'max:80'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = CompanyWorker::forCompany($companyId)->with('user');
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('q')) {
            $term = trim($request->input('q'));
            $digits = preg_replace('/[^0-9Kk]/', '', $term);
            $query->whereHas('user', function ($u) use ($term, $digits) {
                $u->where(function ($w) use ($term, $digits) {
                    $like = '%'.addcslashes($term, '%_\\').'%';
                    $w->where('first_name', 'like', $like)
                        ->orWhere('last_name', 'like', $like)
                        ->orWhere('email', 'like', $like);
                    if (strlen($digits) >= 3) {
                        $w->orWhere('rut', 'like', '%'.$digits.'%');
                    }
                });
            });
        }

        $page = $query->orderBy('created_at', 'desc')->paginate((int) $request->input('per_page', 50));

        $now = Time::toDb(Time::nowUtc());
        $blocked = DB::table('disqualifications')
            ->where('company_id', $companyId)
            ->whereIn('user_id', $page->getCollection()->pluck('user_id'))
            ->where('starts_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->pluck('user_id')->flip();

        $counts = CompanyWorker::forCompany($companyId)
            ->select('status', DB::raw('COUNT(*) as n'))->groupBy('status')->pluck('n', 'status');

        return response()->json([
            'data' => $page->getCollection()->map(function (CompanyWorker $cw) use ($blocked) {
                return $cw->toAdminApi() + ['disqualified' => $blocked->has($cw->user_id)];
            })->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'total' => $page->total(),
                'counts' => $counts,
            ],
        ]);
    }

    /** Invita a una persona ya registrada, buscándola por RUT. */
    public function invite(Request $request): JsonResponse
    {
        $admin = $request->user();
        $companyId = $admin->company_id;

        $request->validate(['rut' => ['required', 'string', 'max:20']]);
        $rut = Rut::normalize((string) $request->input('rut'));
        if ($rut === null || ! Rut::isValid($rut)) {
            return response()->json([
                'message' => 'El RUT no es válido. Revisa el número y el dígito verificador.',
                'errors' => ['rut' => ['El RUT no es válido.']],
            ], 422);
        }

        $misses = $this->missesLast24h($admin->id);
        if ($misses >= self::MAX_MISSES) {
            return response()->json([
                'message' => 'Llegaste al límite de búsquedas sin resultado de las últimas 24 horas. Intenta más tarde o contacta a WorkIn.',
                'code' => 'LOOKUP_LIMIT',
            ], 429);
        }

        $worker = User::where('rut', $rut)
            ->where('role_id', User::ROLE_WORKER)
            ->where('is_active', true)
            ->first();

        DB::table('rut_lookup_attempts')->insert([
            'company_id' => $companyId,
            'user_id' => $admin->id,
            'rut_searched' => $rut,
            'found' => $worker ? 1 : 0,
            'created_at' => now(),
        ]);

        if (! $worker) {
            return response()->json([
                'message' => 'No encontramos ese RUT en WorkIn. Pídele a la persona que se registre primero y vuelve a intentarlo.',
                'code' => 'WORKER_NOT_FOUND',
                'remaining_lookups' => max(0, self::MAX_MISSES - ($misses + 1)),
            ], 404);
        }

        $cw = CompanyWorker::forCompany($companyId)->where('user_id', $worker->id)->first();

        if ($cw) {
            $blockers = [
                'active' => 'Esta persona ya está en tu bolsa.',
                'invited' => 'Esta persona ya tiene una invitación pendiente.',
                'inactive' => 'Esta persona está pausada en tu bolsa. Reactívala desde la lista.',
            ];
            if (isset($blockers[$cw->status])) {
                return response()->json(['message' => $blockers[$cw->status], 'code' => 'ALREADY_IN_POOL'], 409);
            }
        }

        try {
            if (! $cw) {
                $cw = new CompanyWorker;
                $cw->company_id = $companyId;
                $cw->user_id = $worker->id;
                $cw->priority = 'media';
            }
            $cw->status = 'invited';
            $cw->invited_by = $admin->id;
            $cw->invited_at = now();
            $cw->responded_at = null;
            $cw->save();
        } catch (QueryException $e) {
            if ($e->getCode() === '23000') {
                return response()->json(['message' => 'Esta persona ya fue invitada.', 'code' => 'ALREADY_IN_POOL'], 409);
            }
            throw $e;
        }

        Audit::record('company_worker', $cw->id, 'created', $companyId, 'status', null, 'invited', 'Invitación a la bolsa');

        $sent = true;
        try {
            $company = Company::findOrFail($companyId);
            $worker->notify(new WorkerInvitedNotification($company->name));
        } catch (\Throwable $e) {
            $sent = false;
            Log::warning('No se pudo enviar la invitación a la bolsa', ['error' => $e->getMessage()]);
        }

        $cw->setRelation('user', $worker);

        return response()->json([
            'worker' => [
                'id' => (int) $cw->id,
                'user_id' => (int) $worker->id,
                'status' => $cw->status,
                'rut' => Rut::format($worker->rut),
                'first_name' => $worker->first_name,
                'last_name' => $worker->last_name,
            ],
            'email_sent' => $sent,
            'message' => 'Invitación enviada. La persona verá las ofertas de tu empresa cuando la acepte.',
        ], 201);
    }

    /** Cambia prioridad, tarifa propia o pausa/reactiva a un trabajador de la bolsa. */
    public function update(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $cw = CompanyWorker::forCompany($companyId)->with('user')->findOrFail($id);

        $data = $request->validate([
            'priority' => ['sometimes', 'in:alta,media,baja'],
            'status' => ['sometimes', 'in:active,inactive'],
            'rate_id' => ['sometimes', 'nullable', 'integer'],
        ]);

        if (array_key_exists('status', $data)) {
            if (! in_array($cw->status, ['active', 'inactive'], true)) {
                return response()->json([
                    'message' => 'Solo se puede pausar o reactivar a quien ya aceptó la invitación.',
                    'code' => 'INVALID_STATE',
                ], 409);
            }
        }
        if (! empty($data['rate_id']) && ! Rate::forCompany($companyId)->whereKey($data['rate_id'])->exists()) {
            return response()->json(['message' => 'Esa tarifa no existe en tu empresa.', 'errors' => ['rate_id' => ['Tarifa inválida.']]], 422);
        }

        foreach ($data as $field => $value) {
            if ((string) $cw->{$field} !== (string) $value) {
                Audit::record('company_worker', $cw->id, 'updated', $companyId, $field, $cw->{$field}, $value);
            }
            $cw->{$field} = $value;
        }
        $cw->save();

        return response()->json(['worker' => $cw->toAdminApi()]);
    }

    public function disqualify(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $cw = CompanyWorker::forCompany($companyId)->findOrFail($id);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:80'],
            'detail' => ['nullable', 'string', 'max:500'],
            'ends_at' => ['nullable', 'string'],
        ]);

        $ends = null;
        if (! empty($data['ends_at'])) {
            try {
                $endsDt = Time::parse($data['ends_at']);
            } catch (\InvalidArgumentException) {
                return response()->json(['message' => 'La fecha de término no es válida.', 'errors' => ['ends_at' => ['Fecha inválida.']]], 422);
            }
            if ($endsDt <= Time::nowUtc()) {
                return response()->json(['message' => 'La fecha de término debe ser futura.', 'errors' => ['ends_at' => ['Debe ser futura.']]], 422);
            }
            $ends = Time::toDb($endsDt);
        }

        $dq = new Disqualification;
        $dq->company_id = $companyId;
        $dq->user_id = $cw->user_id;
        $dq->reason = trim($data['reason']);
        $dq->detail = $data['detail'] ?? null;
        $dq->disqualified_by = $request->user()->id;
        $dq->starts_at = Time::toDb(Time::nowUtc());
        $dq->ends_at = $ends;
        $dq->save();

        Audit::record('disqualification', $dq->id, 'created', $companyId, null, null, null, $dq->reason);

        return response()->json(['disqualification' => $dq->toApi()], 201);
    }

    /** Termina las inhabilitaciones vigentes del trabajador. */
    public function requalify(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $cw = CompanyWorker::forCompany($companyId)->findOrFail($id);
        $now = Time::toDb(Time::nowUtc());

        $ids = DB::table('disqualifications')
            ->where('company_id', $companyId)->where('user_id', $cw->user_id)
            ->where('starts_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->pluck('id');

        DB::table('disqualifications')->whereIn('id', $ids)->update(['ends_at' => $now, 'updated_at' => now()]);
        foreach ($ids as $dqId) {
            Audit::record('disqualification', $dqId, 'updated', $companyId, 'ends_at', null, $now, 'Habilitado nuevamente');
        }

        return response()->json(['ended' => $ids->count()]);
    }

    private function missesLast24h(int $adminId): int
    {
        return (int) DB::table('rut_lookup_attempts')
            ->where('user_id', $adminId)->where('found', 0)
            ->where('created_at', '>', now()->subDay())
            ->count();
    }
}
