<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    protected $table = 'plans';

    protected $fillable = ['name', 'max_shifts_per_month', 'price_monthly', 'is_active'];

    protected function casts(): array
    {
        return [
            'max_shifts_per_month' => 'integer',
            'price_monthly' => 'integer',
            'is_active' => 'boolean',
        ];
    }
}
