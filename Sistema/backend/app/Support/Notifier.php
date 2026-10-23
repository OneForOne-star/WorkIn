<?php

namespace App\Support;

use App\Models\Shift;
use App\Models\User;
use App\Notifications\NewOfferNotification;
use App\Notifications\ShiftCancelledNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Avisos por correo ligados a turnos. Cada aviso deja una fila en `notifications`
 * (también cuando el correo falla) para no repetirlo.
 */
final class Notifier
{
    /**
     * Avisa de una oferta a quienes ya pueden verla y aún no fueron avisados.
     * Se puede llamar muchas veces: los de prioridad baja reciben el aviso cuando llega su hora.
     */
    public static function offerPublished(Shift $shift): int
    {
        $shift->loadMissing('location');
        $company = DB::table('companies')->where('id', $shift->company_id)->first();
        if (! $company || $company->status !== 'active' || $shift->status !== 'published') {
            return 0;
        }

        $now = Time::toDb(Time::nowUtc());

        $ids = DB::table('company_workers as cw')
            ->join('users as u', 'u.id', '=', 'cw.user_id')
            ->where('cw.company_id', $shift->company_id)
            ->where('cw.status', 'active')
            ->where('u.is_active', 1)
            ->whereNull('u.deleted_at')
            ->whereNotNull('u.email_verified_at')
            ->where(function ($q) use ($shift, $now) {
                $q->where('cw.priority', '<>', 'baja');
                if ($shift->low_priority_visible_at === null) {
                    $q->orWhereRaw('1 = 1');
                } else {
                    $q->orWhereRaw('? >= ?', [$now, Time::toDb($shift->low_priority_visible_at)]);
                }
            })
            ->whereNotExists(function ($q) use ($shift, $now) {
                $q->select(DB::raw(1))->from('disqualifications as d')
                    ->whereColumn('d.user_id', 'cw.user_id')
                    ->where('d.company_id', $shift->company_id)
                    ->where('d.starts_at', '<=', $now)
                    ->where(fn ($w) => $w->whereNull('d.ends_at')->orWhere('d.ends_at', '>', $now));
            })
            ->whereNotExists(function ($q) use ($shift) {
                $q->select(DB::raw(1))->from('notifications as n')
                    ->whereColumn('n.user_id', 'cw.user_id')
                    ->where('n.type', 'new_offer')
                    ->where('n.shift_id', $shift->id);
            })
            ->pluck('cw.user_id');

        $sent = 0;
        foreach (User::whereIn('id', $ids)->get() as $user) {
            $ok = self::send($user, new NewOfferNotification(
                $company->name,
                $shift->title ?: 'Turno',
                $shift->location?->name ?? '',
                Time::toDb($shift->starts_at),
                Time::toDb($shift->ends_at),
            ));
            self::log($user->id, (int) $shift->company_id, (int) $shift->id, 'new_offer',
                'Nueva oferta de '.$company->name, ($shift->title ?: 'Turno').' · '.Time::human($shift->starts_at), $ok);
            $sent += $ok ? 1 : 0;
        }

        return $sent;
    }

    /** Avisa a los aceptados que el turno se canceló. */
    public static function shiftCancelled(Shift $shift, array $userIds): void
    {
        $company = DB::table('companies')->where('id', $shift->company_id)->first();
        foreach (User::whereIn('id', $userIds)->get() as $user) {
            $ok = self::send($user, new ShiftCancelledNotification(
                $company->name ?? 'La empresa',
                $shift->title ?: 'Turno',
                Time::toDb($shift->starts_at),
                $shift->cancellation_reason,
            ));
            self::log($user->id, (int) $shift->company_id, (int) $shift->id, 'shift_cancelled',
                'Turno cancelado', ($shift->title ?: 'Turno').' · '.Time::human($shift->starts_at), $ok);
        }
    }

    private static function send(User $user, $notification): bool
    {
        try {
            $user->notify($notification);

            return true;
        } catch (\Throwable $e) {
            Log::warning('No se pudo enviar el correo de aviso', ['user_id' => $user->id, 'error' => $e->getMessage()]);

            return false;
        }
    }

    private static function log(int $userId, int $companyId, int $shiftId, string $type, string $title, string $message, bool $sent): void
    {
        DB::table('notifications')->insert([
            'user_id' => $userId,
            'company_id' => $companyId,
            'shift_id' => $shiftId,
            'type' => $type,
            'title' => mb_substr($title, 0, 120),
            'message' => mb_substr($message, 0, 500),
            'sent_at' => $sent ? now() : null,
            'created_at' => now(),
        ]);
    }
}
