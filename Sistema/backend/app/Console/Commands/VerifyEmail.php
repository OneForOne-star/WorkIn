<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Audit;
use Illuminate\Console\Command;

/** Herramienta de soporte: confirma el correo de una cuenta cuando el envío de correos aún no está configurado. */
class VerifyEmail extends Command
{
    protected $signature = 'workin:verify-email {email : Correo de la cuenta}';
    protected $description = 'Marca como confirmado el correo de una cuenta (uso de soporte, queda auditado)';

    public function handle(): int
    {
        $user = User::where('email', strtolower(trim($this->argument('email'))))->first();
        if (! $user) {
            $this->error('No existe una cuenta con ese correo.');

            return self::FAILURE;
        }
        if ($user->email_verified_at !== null) {
            $this->info('Ese correo ya estaba confirmado.');

            return self::SUCCESS;
        }

        $user->forceFill(['email_verified_at' => now()])->save();
        Audit::record('user', $user->id, 'updated', $user->company_id, 'email_verified_at', null, now()->toDateString(), 'Confirmado por soporte desde la consola');
        $this->info("Correo confirmado: {$user->email}");

        return self::SUCCESS;
    }
}
