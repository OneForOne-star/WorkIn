<?php

namespace App\Models;

use App\Support\Time;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Shift extends Model
{
    use SoftDeletes;

    protected $table = 'shifts';

    /** company_id, estado y quién lo creó se asignan solo desde el código. */
    protected $fillable = ['location_id', 'title', 'notes', 'starts_at', 'ends_at', 'slots', 'is_night', 'is_holiday', 'low_priority_visible_at'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'location_id' => 'integer',
            'slots' => 'integer',
            'rate_id' => 'integer',
            'shift_amount' => 'integer',
            'overtime_hour_amount' => 'integer',
            'is_night' => 'boolean',
            'is_holiday' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'low_priority_visible_at' => 'datetime',
            'published_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'location_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(ShiftAssignment::class, 'shift_id');
    }

    public function toApi(?int $accepted = null, ?int $applied = null): array
    {
        $out = [
            'id' => (int) $this->id,
            'title' => $this->title,
            'notes' => $this->notes,
            'location' => $this->relationLoaded('location') && $this->location
                ? ['id' => (int) $this->location->id, 'name' => $this->location->name, 'address' => $this->location->address]
                : ['id' => $this->location_id],
            'starts_at' => Time::iso($this->starts_at),
            'ends_at' => Time::iso($this->ends_at),
            'slots' => $this->slots,
            'is_night' => (bool) $this->is_night,
            'is_holiday' => (bool) $this->is_holiday,
            'status' => $this->status,
            'rate' => [
                'id' => $this->rate_id,
                'name' => $this->rate_name,
                'shift_amount' => $this->shift_amount,
                'overtime_hour_amount' => $this->overtime_hour_amount,
            ],
            'low_priority_visible_at' => Time::iso($this->low_priority_visible_at),
            'published_at' => Time::iso($this->published_at),
            'cancellation_reason' => $this->cancellation_reason,
        ];
        if ($accepted !== null) {
            $out['accepted_count'] = $accepted;
            $out['slots_left'] = max(0, $this->slots - $accepted);
        }
        if ($applied !== null) {
            $out['applied_count'] = $applied;
        }

        return $out;
    }
}
