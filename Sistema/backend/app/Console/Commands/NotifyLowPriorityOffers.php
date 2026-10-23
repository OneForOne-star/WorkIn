<?php

namespace App\Console\Commands;

use App\Models\Shift;
use App\Support\Notifier;
use App\Support\Time;
use Illuminate\Console\Command;

class NotifyLowPriorityOffers extends Command
{
    protected $signature = 'workin:notify-low-priority';
    protected $description = 'Avisa de ofertas a los trabajadores de prioridad baja cuando llega la hora desde la que pueden verlas';

    public function handle(): int
    {
        $now = Time::toDb(Time::nowUtc());

        $shifts = Shift::where('status', 'published')
            ->whereNotNull('low_priority_visible_at')
            ->where('low_priority_visible_at', '<=', $now)
            ->where('starts_at', '>', $now)
            ->where('low_priority_visible_at', '>', Time::toDb(Time::nowUtc()->modify('-2 days')))
            ->get();

        $sent = 0;
        foreach ($shifts as $shift) {
            $sent += Notifier::offerPublished($shift);
        }

        $this->info("Avisos enviados: {$sent}");

        return self::SUCCESS;
    }
}
