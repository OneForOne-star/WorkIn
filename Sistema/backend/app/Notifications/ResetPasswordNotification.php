<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ResetPasswordNotification extends Notification
{
    public function __construct(public string $token)
    {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = rtrim(config('workin.frontend_url'), '/').'/restablecer?token='.$this->token
            .'&email='.urlencode($notifiable->getEmailForPasswordReset());
        $minutes = (int) config('auth.passwords.users.expire', 60);

        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Restablece tu contraseña de WorkIn')
            ->greeting('Hola '.$notifiable->first_name)
            ->line('Recibimos una solicitud para cambiar la contraseña de tu cuenta.')
            ->action('Crear nueva contraseña', $url)
            ->line("El enlace vence en {$minutes} minutos. Si no lo pediste, ignora este mensaje: tu contraseña sigue igual.");
    }
}
