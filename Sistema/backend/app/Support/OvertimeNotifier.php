<?php

namespace App\Support;

use App\Models\User;
use App\Notifications\OvertimeRequestedNotification;
use App\Notifications\OvertimeResolvedNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Avisos por correo de las solicitudes de horas extra. Cada aviso queda en `notifications`. */
final class OvertimeNotifier
{
    public static function requested(int $companyId, string $worker, string $shift, string $startsAtUtc, float $hours, string $reason): void
    {
        $date = Periods::fmtDate(Periods::localDate($startsAtUtc));
        $admins = DB::table('users')->where('company_id', $companyId)
            ->whereIn('role_id', [User::ROLE_COMPANY_OWNER, User::ROLE_ADMIN])->where('is_active', 1)->pluck('id');
        foreach ($admins as $adminId) {
            self::go((int) $adminId, $companyId, 'overtime_requested', 'Solicitud de horas extra',
                "{$worker}: {$hours} h por «{$shift}» ({$date}). ".$reason,
                new OvertimeRequestedNotification($worker, $shift, $date, $hours, $reason));
        }
    }

    public static function resolved(int $userId, int $companyId, string $companyName, string $shift, string $startsAtUtc, bool $approved, float $hours, ?string $comment): void
    {
        $date = Periods::fmtDate(Periods::localDate($startsAtUtc));
        self::go($userId, $companyId, 'overtime_resolved', $approved ? 'Horas extra aprobadas' : 'Horas extra no aprobadas',
            "«{$shift}» ({$date})".($comment ? ': '.$comment : ''),
            new OvertimeResolvedNotification($companyName, $shift, $date, $approved, $hours, $comment));
    }

    private static function go(int $userId, int $companyId, string $type, string $title, string $message, $notification): void
    {
        $ok = false;
        try {
            $user = User::find($userId);
            if ($user && $user->is_active) {
                $user->notify($notification);
                $ok = true;
            }
        } catch (\Throwable $e) {
            Log::warning('No se pudo enviar el aviso de horas extra', ['user_id' => $userId, 'error' => $e->getMessage()]);
        }

        DB::table('notifications')->insert([
            'user_id' => $userId, 'company_id' => $companyId, 'shift_id' => null, 'type' => $type,
            'title' => mb_substr($title, 0, 120), 'message' => mb_substr($message, 0, 500),
            'sent_at' => $ok ? now() : null, 'created_at' => now(),
        ]);
    }
}
