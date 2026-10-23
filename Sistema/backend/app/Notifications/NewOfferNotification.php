<?php

namespace App\Notifications;

use App\Support\Time;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Hay una oferta nueva de una empresa de la bolsa del trabajador. */
class NewOfferNotification extends Notification
{
    public function __construct(
        public string $companyName,
        public string $title,
        public string $locationName,
        public string $startsAt,
        public string $endsAt,
    ) {
    }

    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $url = rtrim(config('workin.frontend_url'), '/').'/trabajador/ofertas';

        return (new MailMessage)
            ->salutation('Saludos, equipo WorkIn')
            ->subject('Nueva oferta de '.$this->companyName)
            ->greeting('Hola '.$notifiable->first_name)
            ->line("{$this->companyName} publicó un turno: {$this->title}.")
            ->line('Lugar: '.$this->locationName)
            ->line('Desde: '.Time::human($this->startsAt))
            ->line('Hasta: '.Time::human($this->endsAt))
            ->action('Ver oferta y postular', $url)
            ->line('Los cupos son limitados y la empresa decide a quién acepta.');
    }
}
