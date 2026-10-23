<?php

namespace App\Models;

use App\Support\Rut;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\PersonalAccessToken;

class Company extends Model
{
    use SoftDeletes;

    protected $table = 'companies';

    /** status se cambia solo desde el código, nunca en masa. */
    protected $fillable = ['name', 'tax_id', 'contact_email', 'contact_phone', 'plan_id', 'payment_cycle', 'subscription_ends_at'];

    protected function casts(): array
    {
        return [
            'plan_id' => 'integer',
            'subscription_ends_at' => 'date',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'company_id');
    }

    /** Cierra la sesión de todos los usuarios de la empresa. */
    public function revokeTokens(): void
    {
        $ids = $this->users()->pluck('id');
        PersonalAccessToken::where('tokenable_type', (new User)->getMorphClass())
            ->whereIn('tokenable_id', $ids)
            ->delete();
    }

    public function toApi(): array
    {
        $ends = $this->subscription_ends_at;
        $days = $ends ? (int) now()->startOfDay()->diffInDays($ends->copy()->startOfDay(), false) : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'tax_id' => Rut::format($this->tax_id),
            'contact_email' => $this->contact_email,
            'contact_phone' => $this->contact_phone,
            'plan' => $this->plan ? [
                'id' => (int) $this->plan->id,
                'name' => $this->plan->name,
                'max_shifts_per_month' => $this->plan->max_shifts_per_month,
            ] : null,
            'status' => $this->status,
            'payment_cycle' => $this->payment_cycle,
            'subscription_ends_at' => $ends?->toDateString(),
            'days_left' => $days,
            'suspends_on' => $ends ? $ends->copy()->addDays((int) config('workin.grace_days'))->toDateString() : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
