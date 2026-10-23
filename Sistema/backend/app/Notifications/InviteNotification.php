<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InviteNotification extends Notification
{
    public function __construct(
        public string $token,
        public string $companyName,
        public string $roleLabel,
    ) {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = rtrim(config('workin.frontend_url'), '/').'/crear-contrasena?token='.$this->token
            .'&email='.urlencode($notifiable->email);

        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Tu acceso a WorkIn · '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("Te dieron acceso a WorkIn como {$this->roleLabel} de {$this->companyName}.")
            ->line('Para activar tu cuenta, crea tu propia contraseña con el siguiente botón.')
            ->action('Crear mi contraseña', $url)
            ->line('El enlace vence en 3 días. Si vence, pide que te envíen uno nuevo. Si no esperabas este correo, ignóralo.');
    }
}
