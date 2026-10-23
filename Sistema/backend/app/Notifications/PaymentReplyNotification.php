<?php

namespace App\Notifications;

use App\Support\Periods;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** La empresa respondió el reclamo de un resumen de pago. */
class PaymentReplyNotification extends Notification
{
    public function __construct(
        public string $companyName,
        public string $startDate,
        public string $endDate,
        public string $reply,
    ) {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Respuesta a tu reclamo · '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->companyName} respondió tu reclamo del período ".Periods::fmtDate($this->startDate).' al '.Periods::fmtDate($this->endDate).'.')
            ->line('Respuesta: '.$this->reply)
            ->action('Ver mi resumen', rtrim(config('workin.frontend_url'), '/').'/trabajador/pagos');
    }
}
