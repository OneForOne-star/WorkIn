<?php

namespace App\Listeners;

use Illuminate\Mail\Events\MessageSending;

/**
 * Los trabajadores de prueba (@prueba.workin.cl) no existen como buzones reales:
 * enviarles correo genera rebotes que dañan la reputación del remitente. Se cancela el envío.
 * Laravel detecta este listener solo, por el tipo del parámetro de handle().
 */
class BlockTestEmails
{
    public function handle(MessageSending $event): bool
    {
        foreach ($event->message->getTo() as $address) {
            if (str_ends_with(strtolower($address->getAddress()), '@prueba.workin.cl')) {
                return false;
            }
        }

        return true;
    }
}
