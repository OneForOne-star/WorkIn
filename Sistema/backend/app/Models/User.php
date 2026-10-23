<?php

namespace App\Models;

use App\Notifications\ResetPasswordNotification;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, Notifiable, SoftDeletes;

    public const ROLE_SUPER_ADMIN = 1;
    public const ROLE_ADMIN = 2;
    public const ROLE_COMPANY_OWNER = 3;
    public const ROLE_WORKER = 4;

    public const ROLES = [
        'super_admin' => self::ROLE_SUPER_ADMIN,
        'admin' => self::ROLE_ADMIN,
        'company_owner' => self::ROLE_COMPANY_OWNER,
        'trabajador' => self::ROLE_WORKER,
    ];

    protected $table = 'users';

    /** role_id y company_id NO son asignables en masa a propósito. */
    protected $fillable = ['rut', 'first_name', 'last_name', 'email', 'phone', 'password', 'terms_accepted_at'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'terms_accepted_at' => 'datetime',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
            'role_id' => 'integer',
            'company_id' => 'integer',
            'password' => 'hashed',
        ];
    }

    /** La tabla no tiene remember_token. */
    public function getRememberTokenName(): string
    {
        return '';
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function roleName(): string
    {
        return array_search($this->role_id, self::ROLES, true) ?: 'desconocido';
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification());
    }
}
