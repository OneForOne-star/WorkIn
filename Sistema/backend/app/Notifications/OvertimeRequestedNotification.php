<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Un trabajador pidió horas extra y la empresa debe decidir. */
class OvertimeRequestedNotification extends Notification
{
    public function __construct(public string $worker, public string $shift, public string $date, public float $hours, public string $reason)
    {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Solicitud de horas extra · '.$this->worker)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->worker} pide {$this->hours} h extra por el turno «{$this->shift}» del {$this->date}.")
            ->line('Motivo: '.$this->reason)
            ->line('Solo se pagan las horas extra que apruebas.')
            ->action('Revisar solicitud', rtrim(config('workin.frontend_url'), '/').'/empresa/horas-extra');
    }
}
