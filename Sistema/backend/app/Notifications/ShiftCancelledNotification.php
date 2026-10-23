<?php

namespace App\Notifications;

use App\Support\Time;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Se canceló un turno en el que el trabajador estaba aceptado. */
class ShiftCancelledNotification extends Notification
{
    public function __construct(
        public string $companyName,
        public string $title,
        public string $startsAt,
        public ?string $reason,
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
            ->subject('Turno cancelado · '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->companyName} canceló el turno {$this->title} del ".Time::human($this->startsAt).'.');

        if ($this->reason) {
            $mail->line('Motivo: '.$this->reason);
        }

        return $mail->line('No debes presentarte a ese turno. Revisa tus otras ofertas en WorkIn.')
            ->action('Ver mis turnos', rtrim(config('workin.frontend_url'), '/').'/trabajador/turnos');
    }
}
