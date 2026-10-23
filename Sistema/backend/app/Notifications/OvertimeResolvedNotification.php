<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** La empresa respondió una solicitud de horas extra. */
class OvertimeResolvedNotification extends Notification
{
    public function __construct(public string $companyName, public string $shift, public string $date, public bool $approved, public float $hours, public ?string $comment)
    {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject(($this->approved ? 'Horas extra aprobadas' : 'Horas extra no aprobadas').' · '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line($this->approved
                ? "{$this->companyName} aprobó {$this->hours} h extra por el turno «{$this->shift}» del {$this->date}. Se sumarán a tu pago."
                : "{$this->companyName} no aprobó las horas extra que pediste por el turno «{$this->shift}» del {$this->date}.");
        if ($this->comment) {
            $mail->line('Comentario: '.$this->comment);
        }

        return $mail->action('Ver mis turnos', rtrim(config('workin.frontend_url'), '/').'/trabajador/turnos');
    }
}
