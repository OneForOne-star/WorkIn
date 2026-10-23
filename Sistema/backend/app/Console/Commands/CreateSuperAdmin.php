<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\Rut;
use Illuminate\Console\Command;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

class CreateSuperAdmin extends Command
{
    protected $signature = 'workin:create-super-admin';
    protected $description = 'Crea una cuenta Super Admin de WorkIn (equipo proveedor)';

    public function handle(): int
    {
        $rut = text('RUT (ej. 12.345.678-5)', required: true, validate: fn ($v) => Rut::isValid($v) ? null : 'RUT inválido');
        $rut = Rut::normalize($rut);
        if (User::withTrashed()->where('rut', $rut)->exists()) {
            $this->error('Ya existe un usuario con ese RUT.');

            return self::FAILURE;
        }

        $first = text('Nombres', required: true);
        $last = text('Apellidos', required: true);
        $email = strtolower(text('Correo', required: true, validate: fn ($v) => filter_var($v, FILTER_VALIDATE_EMAIL) ? null : 'Correo inválido'));
        if (User::withTrashed()->where('email', $email)->exists()) {
            $this->error('Ya existe un usuario con ese correo.');

            return self::FAILURE;
        }
        $phone = Rut::normalizePhone(text('Celular (ej. +56 9 1234 5678)', required: true, validate: fn ($v) => Rut::normalizePhone($v) ? null : 'Celular inválido'));
        $pass = password('Contraseña (mínimo 12 caracteres)', required: true, validate: fn ($v) => strlen($v) >= 12 ? null : 'Mínimo 12 caracteres');

        $user = new User(['rut' => $rut, 'first_name' => $first, 'last_name' => $last, 'email' => $email, 'phone' => $phone, 'password' => $pass]);
        $user->role_id = User::ROLE_SUPER_ADMIN;
        $user->company_id = null;
        $user->is_active = true;
        $user->email_verified_at = now();
        $user->save();

        $this->info("Super Admin creado: {$email}");

        return self::SUCCESS;
    }
}
