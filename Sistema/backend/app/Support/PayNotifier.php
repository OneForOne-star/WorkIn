<?php

namespace App\Support;

use App\Models\User;
use App\Notifications\PaymentReplyNotification;
use App\Notifications\PaymentStatementNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Avisos por correo del cierre de períodos. Cada aviso queda registrado en `notifications`. */
final class PayNotifier
{
    public static function statementSent(int $userId, int $companyId, string $companyName, object $period, int $shifts, float $ot, int $amount): void
    {
        self::go($userId, $companyId, 'payment_statement', 'Resumen de pago de '.$companyName,
            'Período '.Periods::fmtDate($period->start_date).' al '.Periods::fmtDate($period->end_date).' · '.Periods::clp($amount),
            new PaymentStatementNotification($companyName, $period->start_date, $period->end_date, $shifts, $ot, $amount));
    }

    public static function replied(int $userId, int $companyId, string $companyName, object $period, string $reply): void
    {
        self::go($userId, $companyId, 'payment_reply', 'Respuesta a tu reclamo de '.$companyName, mb_substr($reply, 0, 400),
            new PaymentReplyNotification($companyName, $period->start_date, $period->end_date, $reply));
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
            Log::warning('No se pudo enviar el aviso de pago', ['user_id' => $userId, 'error' => $e->getMessage()]);
        }

        DB::table('notifications')->insert([
            'user_id' => $userId, 'company_id' => $companyId, 'shift_id' => null, 'type' => $type,
            'title' => mb_substr($title, 0, 120), 'message' => mb_substr($message, 0, 500),
            'sent_at' => $ok ? now() : null, 'created_at' => now(),
        ]);
    }
}
