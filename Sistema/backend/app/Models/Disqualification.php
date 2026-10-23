<?php

namespace App\Models;

use App\Support\Time;
use Illuminate\Database\Eloquent\Model;

class Disqualification extends Model
{
    protected $table = 'disqualifications';

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'user_id' => 'integer',
            'disqualified_by' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function toApi(): array
    {
        return [
            'id' => (int) $this->id,
            'user_id' => (int) $this->user_id,
            'reason' => $this->reason,
            'detail' => $this->detail,
            'starts_at' => Time::iso($this->starts_at),
            'ends_at' => Time::iso($this->ends_at),
        ];
    }

    /** ¿Tiene el trabajador una inhabilitación vigente en esa empresa? */
    public static function activeFor(int $companyId, int $userId): bool
    {
        $now = Time::toDb(Time::nowUtc());

        return static::where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('starts_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->exists();
    }
}
