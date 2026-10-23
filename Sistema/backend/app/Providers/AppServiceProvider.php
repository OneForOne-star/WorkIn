<?php

namespace App\Providers;

use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
    }

    public function boot(): void
    {
        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }

        // Enlaces de invitación: duran 3 días (los de recuperación de contraseña, 60 minutos)
        config(['auth.passwords.invitations' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60 * 24 * 3,
            'throttle' => 60,
        ]]);
    }
}
