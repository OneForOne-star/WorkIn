<?php

namespace App\Models;

use App\Support\Time;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Rate extends Model
{
    protected $table = 'rates';

    protected $fillable = ['name', 'shift_amount', 'overtime_hour_amount', 'valid_from', 'valid_to'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'shift_amount' => 'integer',
            'overtime_hour_amount' => 'integer',
            'valid_from' => 'date:Y-m-d',
            'valid_to' => 'date:Y-m-d',
        ];
    }

    public function scopeForCompany(Builder $q, int $companyId): Builder
    {
        return $q->where('company_id', $companyId);
    }

    /** Tarifas vigentes hoy (hora de Santiago). */
    public function scopeCurrent(Builder $q): Builder
    {
        $today = Time::todayLocal();

        return $q->where('valid_from', '<=', $today)
            ->where(fn ($w) => $w->whereNull('valid_to')->orWhere('valid_to', '>=', $today));
    }

    /** Tarifa vigente de la empresa más reciente (la que aplica si el trabajador no tiene una propia). */
    public static function currentFor(int $companyId): ?self
    {
        return static::forCompany($companyId)->current()->orderByDesc('valid_from')->orderByDesc('id')->first();
    }

    /** Tarifa que aplica a un trabajador: la propia si se le asignó una, si no la vigente de la empresa. */
    public static function resolveFor(int $companyId, int $userId): ?self
    {
        $rateId = DB::table('company_workers')
            ->where('company_id', $companyId)->where('user_id', $userId)->value('rate_id');

        if ($rateId) {
            $own = static::forCompany($companyId)->find($rateId);
            if ($own) {
                return $own;
            }
        }

        return static::currentFor($companyId);
    }

    public function toApi(): array
    {
        return [
            'id' => (int) $this->id,
            'name' => $this->name,
            'shift_amount' => $this->shift_amount,
            'overtime_hour_amount' => $this->overtime_hour_amount,
            'valid_from' => $this->valid_from?->format('Y-m-d'),
            'valid_to' => $this->valid_to?->format('Y-m-d'),
        ];
    }
}
