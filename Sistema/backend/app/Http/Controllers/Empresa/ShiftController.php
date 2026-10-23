<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Location;
use App\Models\Rate;
use App\Models\Shift;
use App\Support\Audit;
use App\Support\Notifier;
use App\Support\Time;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Turnos que publica la empresa. */
class ShiftController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;

        $request->validate([
            'from' => ['nullable', 'string'],
            'to' => ['nullable', 'string'],
            'status' => ['nullable', 'in:draft,published,cancelled,closed'],
            'location_id' => ['nullable', 'integer'],
        ]);

        $from = $request->filled('from') ? $this->date($request->input('from'), 'from') : Time::nowUtc()->modify('-7 days');
        $query = Shift::forCompany($companyId)->with('location')
            ->withCount([
                'assignments as accepted_count' => fn ($q) => $q->where('status', 'accepted'),
                'assignments as applied_count' => fn ($q) => $q->where('status', 'applied'),
            ])
            ->where('ends_at', '>=', Time::toDb($from));

        if ($request->filled('to')) {
            $query->where('starts_at', '<', Time::toDb($this->date($request->input('to'), 'to')));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('location_id')) {
            $query->where('location_id', (int) $request->input('location_id'));
        }

        $shifts = $query->orderBy('starts_at')->limit(500)->get();

        return response()->json([
            'data' => $shifts->map(fn (Shift $s) => $s->toApi((int) $s->accepted_count, (int) $s->applied_count)),
            'usage' => $this->usage($companyId),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $shift = $this->mine($request, $id)->load('location');

        return response()->json([
            'shift' => $shift->toApi($this->count($shift->id, 'accepted'), $this->count($shift->id, 'applied')),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $data = $this->validated($request, null);

        $publish = $request->boolean('publish', true);
        $rate = $data['rate'];

        $shift = new Shift([
            'location_id' => $data['location_id'],
            'title' => $data['title'],
            'notes' => $data['notes'],
            'slots' => $data['slots'],
            'is_night' => $data['is_night'],
            'is_holiday' => $data['is_holiday'],
        ]);
        $shift->company_id = $companyId;
        $shift->created_by = $request->user()->id;
        $this->applyRate($shift, $rate);
        $shift->starts_at = Time::toDb($data['starts']);
        $shift->ends_at = Time::toDb($data['ends']);
        $shift->low_priority_visible_at = $data['low_visible'] ? Time::toDb($data['low_visible']) : null;
        $shift->status = $publish ? 'published' : 'draft';
        $shift->published_at = $publish ? now() : null;
        $shift->save();

        Audit::record('shift', $shift->id, 'created', $companyId, null, null, null, $publish ? 'Turno publicado' : 'Turno en borrador');

        if ($publish) {
            $this->notifyAfterResponse($shift->id);
        }

        $shift->load('location');

        return response()->json([
            'shift' => $shift->toApi(0, 0),
            'usage' => $this->usage($companyId),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $shift = $this->mine($request, $id);

        if (in_array($shift->status, ['cancelled', 'closed'], true)) {
            return response()->json(['message' => 'Este turno ya no se puede editar.', 'code' => 'SHIFT_LOCKED'], 409);
        }

        $accepted = $this->count($shift->id, 'accepted');
        $data = $this->validated($request, $shift);

        $timeChanged = Time::toDb($data['starts']) !== Time::toDb($shift->starts_at)
            || Time::toDb($data['ends']) !== Time::toDb($shift->ends_at)
            || (int) $data['location_id'] !== (int) $shift->location_id;
        if ($accepted > 0 && $timeChanged) {
            return response()->json([
                'message' => 'Ya hay trabajadores aceptados. No se puede cambiar el horario ni el lugar: cancela el turno y crea otro.',
                'code' => 'SHIFT_HAS_ACCEPTED',
            ], 409);
        }
        if ($data['slots'] < $accepted) {
            return response()->json([
                'message' => "Ya hay {$accepted} aceptados; los cupos no pueden ser menos.",
                'errors' => ['slots' => ['Los cupos no pueden ser menos que los aceptados.']],
            ], 422);
        }

        // La tarifa queda fija al publicar: solo un borrador puede cambiarla.
        if ((int) $data['rate']->id !== (int) $shift->rate_id) {
            if ($shift->status !== 'draft') {
                return response()->json([
                    'message' => 'La tarifa quedó fija al publicar el turno. Si necesitas otra, cancela el turno y crea uno nuevo.',
                    'code' => 'RATE_LOCKED',
                ], 409);
            }
            Audit::record('shift', $shift->id, 'updated', $companyId, 'rate_id', $shift->rate_id, $data['rate']->id);
            $this->applyRate($shift, $data['rate']);
        }

        $changes = [
            'location_id' => $data['location_id'],
            'title' => $data['title'],
            'notes' => $data['notes'],
            'slots' => $data['slots'],
            'is_night' => $data['is_night'],
            'is_holiday' => $data['is_holiday'],
            'starts_at' => Time::toDb($data['starts']),
            'ends_at' => Time::toDb($data['ends']),
            'low_priority_visible_at' => $data['low_visible'] ? Time::toDb($data['low_visible']) : null,
        ];
        foreach ($changes as $field => $new) {
            $old = $shift->getRawOriginal($field);
            if (in_array($field, ['is_night', 'is_holiday'], true)) {
                $old = (int) $old;
                $new = (int) $new;
            }
            if ((string) $old !== (string) $new) {
                Audit::record('shift', $shift->id, 'updated', $companyId, $field, $old, $new);
            }
            $shift->{$field} = $new;
        }
        $shift->save();
        $shift->load('location');

        return response()->json(['shift' => $shift->toApi($accepted, $this->count($shift->id, 'applied'))]);
    }

    /** Pasa un borrador a publicado y avisa a la bolsa. */
    public function publish(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $shift = $this->mine($request, $id);

        if ($shift->status !== 'draft') {
            return response()->json(['message' => 'Solo se pueden publicar borradores.', 'code' => 'INVALID_STATE'], 409);
        }
        if ($shift->starts_at <= Time::nowUtc()) {
            return response()->json(['message' => 'El turno ya empezó o su fecha pasó. Edita la fecha antes de publicar.', 'code' => 'SHIFT_IN_PAST'], 409);
        }
        if ($err = $this->cannotPublish($shift)) {
            return $err;
        }

        $shift->status = 'published';
        $shift->published_at = now();
        $shift->save();
        Audit::record('shift', $shift->id, 'updated', $companyId, 'status', 'draft', 'published');
        $this->notifyAfterResponse($shift->id);

        return response()->json([
            'shift' => $shift->load('location')->toApi(0, 0),
            'usage' => $this->usage($companyId),
        ]);
    }

    /** Cancela el turno: los aceptados reciben un correo. */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $shift = $this->mine($request, $id);

        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);

        if (! in_array($shift->status, ['draft', 'published'], true)) {
            return response()->json(['message' => 'Este turno ya está cancelado o cerrado.', 'code' => 'INVALID_STATE'], 409);
        }
        if ($shift->starts_at <= Time::nowUtc()) {
            return response()->json(['message' => 'El turno ya comenzó; no se puede cancelar.', 'code' => 'SHIFT_STARTED'], 409);
        }

        $oldStatus = $shift->status;
        $acceptedUsers = DB::transaction(function () use ($shift, $data, $request, $companyId, $oldStatus) {
            $users = DB::table('shift_assignments')
                ->where('shift_id', $shift->id)->where('company_id', $companyId)
                ->where('status', 'accepted')->pluck('user_id')->all();

            DB::table('shift_assignments')
                ->where('shift_id', $shift->id)->where('company_id', $companyId)
                ->whereIn('status', ['applied', 'accepted'])
                ->update(['status' => 'cancelled', 'updated_at' => now()]);

            $shift->status = 'cancelled';
            $shift->cancellation_reason = trim($data['reason']);
            $shift->cancelled_at = now();
            $shift->cancelled_by = $request->user()->id;
            $shift->save();

            Audit::record('shift', $shift->id, 'updated', $companyId, 'status', $oldStatus, 'cancelled', $shift->cancellation_reason);

            return $users;
        });

        if ($acceptedUsers) {
            $shiftId = $shift->id;
            app()->terminating(fn () => Notifier::shiftCancelled(Shift::findOrFail($shiftId), $acceptedUsers));
        }

        return response()->json([
            'shift' => $shift->load('location')->toApi(0, 0),
            'notified' => count($acceptedUsers),
        ]);
    }

    // ------------------------------------------------------------------

    private function mine(Request $request, int $id): Shift
    {
        return Shift::forCompany($request->user()->company_id)->findOrFail($id);
    }

    private function count(int $shiftId, string $status): int
    {
        return (int) DB::table('shift_assignments')->where('shift_id', $shiftId)->where('status', $status)->count();
    }

    private function notifyAfterResponse(int $shiftId): void
    {
        app()->terminating(function () use ($shiftId) {
            $s = Shift::find($shiftId);
            if ($s) {
                Notifier::offerPublished($s);
            }
        });
    }

    /** Un turno se publica solo con una tarifa que esté vigente el día en que se trabaja. */
    private function cannotPublish(Shift $shift): ?JsonResponse
    {
        $rate = $shift->rate_id ? Rate::forCompany((int) $shift->company_id)->find($shift->rate_id) : null;
        if (! $rate) {
            return response()->json([
                'message' => 'Este turno no tiene tarifa. Edita el borrador y elige una.',
                'code' => 'NO_RATE',
            ], 409);
        }
        if (! $this->rateCoversDate($rate, $this->localDate($shift->starts_at))) {
            return response()->json([
                'message' => 'La tarifa elegida no está vigente el día del turno. Edita el borrador y elige otra.',
                'code' => 'RATE_NOT_VALID',
            ], 409);
        }

        return null;
    }

    private function localDate(\DateTimeInterface $utc): string
    {
        return DateTimeImmutable::createFromInterface($utc)->setTimezone(new DateTimeZone('America/Santiago'))->format('Y-m-d');
    }

    private function rateCoversDate(Rate $rate, string $ymd): bool
    {
        return $rate->valid_from->format('Y-m-d') <= $ymd
            && ($rate->valid_to === null || $rate->valid_to->format('Y-m-d') >= $ymd);
    }

    /** Copia la tarifa al turno: nombre y montos quedan fijos aunque la tarifa cambie después. */
    private function applyRate(Shift $shift, Rate $rate): void
    {
        $shift->rate_id = $rate->id;
        $shift->rate_name = $rate->name;
        $shift->shift_amount = $rate->shift_amount;
        $shift->overtime_hour_amount = $rate->overtime_hour_amount;
    }

    /** Uso del mes frente al límite del plan. Solo informa: no bloquea. */
    private function usage(int $companyId): array
    {
        [$start, $end] = Time::monthBoundsUtc();
        $used = (int) DB::table('shifts')->where('company_id', $companyId)
            ->whereNull('deleted_at')->whereIn('status', ['published', 'closed'])
            ->where('starts_at', '>=', $start)->where('starts_at', '<', $end)->count();

        $limit = Company::with('plan')->find($companyId)?->plan?->max_shifts_per_month;
        $limit = $limit === null ? null : (int) $limit;

        return [
            'used' => $used,
            'limit' => $limit,
            'over_limit' => $limit !== null && $used > $limit,
        ];
    }

    /** @return array<string,mixed> */
    private function validated(Request $request, ?Shift $existing): array
    {
        $companyId = $request->user()->company_id;

        $v = $request->validate([
            'location_id' => ['required', 'integer'],
            'title' => ['required', 'string', 'min:2', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
            'starts_at' => ['required', 'string'],
            'ends_at' => ['required', 'string'],
            'slots' => ['required', 'integer', 'min:1', 'max:500'],
            'is_night' => ['sometimes', 'boolean'],
            'is_holiday' => ['sometimes', 'boolean'],
            'low_priority_visible_at' => ['nullable', 'string'],
            'rate_id' => ['nullable', 'integer'],
        ]);

        $location = Location::forCompany($companyId)->whereKey($v['location_id'])->first();
        if (! $location || (! $location->is_active && (! $existing || (int) $existing->location_id !== (int) $location->id))) {
            throw ValidationException::withMessages(['location_id' => ['Elige un lugar activo de tu empresa.']]);
        }

        $starts = $this->date($v['starts_at'], 'starts_at');
        $ends = $this->date($v['ends_at'], 'ends_at');
        $now = Time::nowUtc();

        // Al editar un turno que ya tiene su horario guardado, no se exige que sea futuro si no se cambió.
        $startsUnchanged = $existing && Time::toDb($starts) === Time::toDb($existing->starts_at);
        if (! $startsUnchanged && $starts <= $now) {
            throw ValidationException::withMessages(['starts_at' => ['El turno debe empezar en el futuro.']]);
        }
        if ($ends <= $starts) {
            throw ValidationException::withMessages(['ends_at' => ['El término debe ser posterior al inicio.']]);
        }
        if ($ends > $starts->modify('+24 hours')) {
            throw ValidationException::withMessages(['ends_at' => ['Un turno no puede durar más de 24 horas.']]);
        }

        // Tarifa: la elegida, o la que ya tenía el turno, o (si no se indica) la vigente de la empresa.
        $rateId = $v['rate_id'] ?? $existing?->rate_id;
        $rate = $rateId
            ? Rate::forCompany($companyId)->find($rateId)
            : Rate::forCompany($companyId)->orderByDesc('valid_from')->orderByDesc('id')
                ->get()->first(fn (Rate $r) => $this->rateCoversDate($r, $this->localDate($starts)));
        if (! $rate) {
            throw ValidationException::withMessages(['rate_id' => [$rateId
                ? 'Elige una tarifa de tu empresa.'
                : 'No hay una tarifa vigente para esa fecha. Crea una en Tarifas o elige otra.']]);
        }
        $keepsOwn = $existing && (int) $existing->rate_id === (int) $rate->id;
        if (! $keepsOwn && ! $this->rateCoversDate($rate, $this->localDate($starts))) {
            throw ValidationException::withMessages(['rate_id' => ['Esa tarifa no está vigente el día del turno.']]);
        }

        $low = null;
        if (! empty($v['low_priority_visible_at'])) {
            $low = $this->date($v['low_priority_visible_at'], 'low_priority_visible_at');
            if ($low >= $starts) {
                throw ValidationException::withMessages(['low_priority_visible_at' => ['Debe ser antes del inicio del turno.']]);
            }
        }

        return [
            'location_id' => (int) $location->id,
            'title' => trim($v['title']),
            'notes' => isset($v['notes']) ? trim($v['notes']) ?: null : null,
            'slots' => (int) $v['slots'],
            'is_night' => (bool) ($v['is_night'] ?? false),
            'is_holiday' => (bool) ($v['is_holiday'] ?? false),
            'starts' => $starts,
            'ends' => $ends,
            'low_visible' => $low,
            'rate' => $rate,
        ];
    }

    private function date(string $value, string $field): DateTimeImmutable
    {
        try {
            return Time::parse($value);
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages([$field => ['Fecha u hora inválida.']]);
        }
    }
}
