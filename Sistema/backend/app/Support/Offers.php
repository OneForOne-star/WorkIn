<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Qué ofertas puede ver un trabajador. Una sola definición, usada al listar y al postular. */
final class Offers
{
    /**
     * Turnos publicados, futuros, de empresas activas donde el trabajador está activo en la bolsa,
     * sin inhabilitación vigente y respetando el retraso de prioridad baja.
     */
    public static function visibleTo(int $userId): Builder
    {
        $now = Time::toDb(Time::nowUtc());

        return DB::table('company_workers as cw')
            ->join('shifts as s', 's.company_id', '=', 'cw.company_id')
            ->join('companies as c', 'c.id', '=', 's.company_id')
            ->join('locations as l', 'l.id', '=', 's.location_id')
            ->where('cw.user_id', $userId)
            ->where('cw.status', 'active')
            ->where('c.status', 'active')
            ->whereNull('c.deleted_at')
            ->where('s.status', 'published')
            ->whereNull('s.deleted_at')
            ->whereNull('s.archived_at')
            ->where('s.starts_at', '>', $now)
            ->where(function ($q) use ($now) {
                $q->where('cw.priority', '<>', 'baja')
                    ->orWhereNull('s.low_priority_visible_at')
                    ->orWhere('s.low_priority_visible_at', '<=', $now);
            })
            ->whereNotExists(function ($q) use ($now) {
                $q->select(DB::raw(1))->from('disqualifications as d')
                    ->whereColumn('d.company_id', 's.company_id')
                    ->whereColumn('d.user_id', 'cw.user_id')
                    ->where('d.starts_at', '<=', $now)
                    ->where(fn ($w) => $w->whereNull('d.ends_at')->orWhere('d.ends_at', '>', $now));
            });
    }
}
