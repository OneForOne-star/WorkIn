<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Location extends Model
{
    use SoftDeletes;

    protected $table = 'locations';

    /** company_id, qr_secret y los datos de la pantalla se asignan solo desde el código. */
    protected $fillable = ['name', 'address', 'is_active'];

    protected $hidden = ['qr_secret', 'display_token_hash'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'is_active' => 'boolean',
            'display_token_rotated_at' => 'datetime',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    public function toApi(): array
    {
        return [
            'id' => (int) $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'is_active' => (bool) $this->is_active,
            'has_display_link' => $this->display_token_hash !== null,
        ];
    }
}
