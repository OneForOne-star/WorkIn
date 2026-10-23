<?php

namespace App\Console\Commands;

use App\Support\Time;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Pasados 2 años queda el registro "archivado": ya no aparece en el acceso normal (se conserva 1 año más). */
class ArchiveOldRecords extends Command
{
    protected $signature = 'workin:archive';
    protected $description = 'Archiva turnos, postulaciones y asistencias de más de 2 años';

    public function handle(): int
    {
        $cutoff = Time::toDb(Time::nowUtc()->modify('-2 years'));
        $now = now();

        $shifts = DB::table('shifts')->whereNull('archived_at')->where('ends_at', '<', $cutoff)
            ->update(['archived_at' => $now]);

        $oldShiftIds = fn ($q) => $q->select('id')->from('shifts')->where('ends_at', '<', $cutoff);

        $assignments = DB::table('shift_assignments')->whereNull('archived_at')
            ->whereIn('shift_id', $oldShiftIds)
            ->update(['archived_at' => $now]);

        $attendances = DB::table('attendances')->whereNull('archived_at')
            ->whereIn('shift_assignment_id', fn ($q) => $q->select('id')->from('shift_assignments')->whereIn('shift_id', $oldShiftIds))
            ->update(['archived_at' => $now]);

        $this->info("Archivados: {$shifts} turnos, {$assignments} postulaciones, {$attendances} asistencias");

        return self::SUCCESS;
    }
}
