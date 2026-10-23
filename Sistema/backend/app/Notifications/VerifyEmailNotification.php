<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

class VerifyEmailNotification extends Notification
{
    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = URL::temporarySignedRoute('verification.verify', now()->addHours(48), [
            'id' => $notifiable->getKey(),
            'hash' => sha1($notifiable->email),
        ]);

        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Confirma tu correo en WorkIn')
            ->greeting('Hola '.$notifiable->first_name)
            ->line('Para activar tu cuenta de WorkIn, confirma tu correo con el siguiente botón.')
            ->action('Confirmar correo', $url)
            ->line('El enlace vence en 48 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.');
    }
}
