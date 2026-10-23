<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Una empresa invitó al trabajador a su bolsa. */
class WorkerInvitedNotification extends Notification
{
    public function __construct(public string $companyName)
    {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = rtrim(config('workin.frontend_url'), '/').'/trabajador';

        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject($this->companyName.' te invitó a su bolsa de trabajo en WorkIn')
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->companyName} te invitó a recibir sus ofertas de turnos.")
            ->line('Entra a WorkIn para aceptar o rechazar la invitación. Solo recibirás ofertas de esa empresa si la aceptas.')
            ->action('Ver invitación', $url);
    }
}
