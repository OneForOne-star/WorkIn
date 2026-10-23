<?php

return [
    // Dirección de la web React (para enlaces en correos y redirecciones)
    'frontend_url' => env('FRONTEND_URL', 'https://workin.otecnya.cl'),

    // Días de gracia después del vencimiento antes de suspender una empresa
    'grace_days' => (int) env('WORKIN_GRACE_DAYS', 14),

    // Horas mínimas de anticipación para que un trabajador se retire de un turno ya aceptado
    'worker_cancel_hours' => (int) env('WORKIN_WORKER_CANCEL_HOURS', 24),
];
