<?php

use Illuminate\Support\Facades\Schedule;

// Cada noche (03:00 UTC, medianoche en Santiago) suspende empresas vencidas.
Schedule::command('workin:suspend-expired')->dailyAt('03:00');

// Avisa a los de prioridad baja cuando llega la hora desde la que ven cada oferta.
Schedule::command('workin:notify-low-priority')->everyFiveMinutes()->withoutOverlapping();

// Archivado de registros con más de 2 años.
Schedule::command('workin:archive')->dailyAt('03:30');
