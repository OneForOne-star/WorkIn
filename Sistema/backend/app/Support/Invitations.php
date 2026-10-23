<?php

namespace App\Support;

use App\Models\Company;
use App\Models\User;
use App\Notifications\InviteNotification;
use Illuminate\Support\Facades\Password;

final class Invitations
{
    /** Crea un enlace de 3 días para que la persona fije su propia contraseña. */
    public static function send(User $user, Company $company): bool
    {
        try {
            $token = Password::broker('invitations')->createToken($user);
            $role = $user->role_id === User::ROLE_COMPANY_OWNER ? 'dueño de la cuenta' : 'administrador';
            $user->notify(new InviteNotification($token, $company->name, $role));

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}
