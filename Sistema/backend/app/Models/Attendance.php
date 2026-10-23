<?php

namespace App\Models;

use App\Support\Time;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Attendance extends Model
{
    use SoftDeletes;

    protected $table = 'attendances';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'shift_assignment_id' => 'integer',
            'rate_id' => 'integer',
            'check_in_at' => 'datetime',
            'check_out_at' => 'datetime',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    public function assignment(): BelongsTo
    {
        return $this->belongsTo(ShiftAssignment::class, 'shift_assignment_id');
    }

    public function overtime(): HasMany
    {
        return $this->hasMany(OvertimeHour::class, 'attendance_id');
    }

    public function toApi(): array
    {
        return [
            'id' => (int) $this->id,
            'check_in_at' => Time::iso($this->check_in_at),
            'check_in_method' => $this->check_in_method,
            'check_out_at' => Time::iso($this->check_out_at),
            'check_out_method' => $this->check_out_method,
            'comments' => $this->comments,
            'overtime_hours' => $this->relationLoaded('overtime')
                ? round((float) $this->overtime->sum('hours'), 2)
                : null,
        ];
    }
}
