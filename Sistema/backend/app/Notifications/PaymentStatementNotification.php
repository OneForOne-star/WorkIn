<?php

namespace App\Notifications;

use App\Support\Periods;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** La empresa cerró un período y el trabajador tiene un resumen de pago para revisar. */
class PaymentStatementNotification extends Notification
{
    public function __construct(
        public string $companyName,
        public string $startDate,
        public string $endDate,
        public int $shifts,
        public float $overtimeHours,
        public int $amount,
    ) {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Tu resumen de pago · '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->companyName} cerró el período del ".Periods::fmtDate($this->startDate).' al '.Periods::fmtDate($this->endDate).'.')
            ->line("Turnos: {$this->shifts}".($this->overtimeHours > 0 ? " · Horas extra: {$this->overtimeHours}" : ''))
            ->line('Monto bruto: '.Periods::clp($this->amount))
            ->line('Revisa el detalle. Si está bien, acéptalo; si algo no cuadra, puedes indicarlo y la empresa te responderá.');

        return $mail->action('Revisar mi resumen', rtrim(config('workin.frontend_url'), '/').'/trabajador/pagos');
    }
}
