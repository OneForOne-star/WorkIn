<?php

namespace App\Models;

use App\Support\Rut;
use App\Support\Time;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Pertenencia de un trabajador a la bolsa de una empresa. */
class CompanyWorker extends Model
{
    protected $table = 'company_workers';

    /** Todo se asigna desde el código. */
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'user_id' => 'integer',
            'rate_id' => 'integer',
            'invited_by' => 'integer',
            'invited_at' => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function rate(): BelongsTo
    {
        return $this->belongsTo(Rate::class, 'rate_id');
    }

    /** Vista para el administrador de la empresa. */
    public function toAdminApi(): array
    {
        $u = $this->user;
        // Los datos de contacto solo se ven cuando la persona ya aceptó estar en la bolsa.
        $contact = in_array($this->status, ['active', 'inactive'], true);

        return [
            'id' => (int) $this->id,
            'user_id' => (int) $this->user_id,
            'status' => $this->status,
            'priority' => $this->priority,
            'rate_id' => $this->rate_id,
            'rut' => $u ? Rut::format($u->rut) : null,
            'first_name' => $u?->first_name,
            'last_name' => $u?->last_name,
            'email' => $contact ? $u?->email : null,
            'phone' => $contact ? $u?->phone : null,
            'invited_at' => Time::iso($this->invited_at),
            'responded_at' => Time::iso($this->responded_at),
        ];
    }
}
