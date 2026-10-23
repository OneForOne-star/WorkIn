<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ShiftAssignment extends Model
{
    protected $table = 'shift_assignments';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'shift_id' => 'integer',
            'user_id' => 'integer',
            'decided_by' => 'integer',
            'applied_at' => 'datetime',
            'decided_at' => 'datetime',
            'withdrawn_at' => 'datetime',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class, 'shift_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function attendance(): HasOne
    {
        return $this->hasOne(Attendance::class, 'shift_assignment_id');
    }
}
