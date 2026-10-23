<?php
// WorkIn - verificacion de solo lectura (no escribe nada en la base).
$root = getcwd();
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

function ok($m){ echo "  OK   $m\n"; }
function bad($m){ echo "  FALLA $m\n"; }
function chk($c,$m){ $c ? ok($m) : bad($m); }

echo "== 1. Archivos y base ==\n";
chk(class_exists('App\Support\Periods'), 'backend nuevo instalado (Periods)');
chk(class_exists('App\Http\Controllers\Empresa\PeriodController'), 'PeriodController');
chk(class_exists('App\Http\Controllers\Trabajador\PaymentController'), 'PaymentController');
$cols = array_column(DB::select("SHOW COLUMNS FROM payment_statements"), 'Field');
chk(in_array('admin_reply', $cols) && in_array('replied_at', $cols), 'parche SQL 05 aplicado (admin_reply, replied_at)');
$scols = array_column(DB::select("SHOW COLUMNS FROM shifts"), 'Field');
chk(in_array('rate_id', $scols) && in_array('shift_amount', $scols), 'parche SQL 04 aplicado (tarifa en turnos)');
$m = DB::selectOne("SELECT (SELECT COUNT(*) FROM shifts WHERE title LIKE '[PRUEBA]%') s, (SELECT COUNT(*) FROM users WHERE email LIKE '%@prueba.workin.cl') u, (SELECT COUNT(*) FROM attendances) a, (SELECT COUNT(*) FROM payment_periods) p");
echo "  datos de prueba: {$m->s} turnos, {$m->u} trabajadores; asistencias totales {$m->a}; periodos cerrados {$m->p}\n";

echo "== 2. Rutas ==\n";
$routes = collect(app('router')->getRoutes())->map(fn($r) => implode('|', $r->methods()).' '.$r->uri())->all();
foreach (['GET|HEAD api/v1/empresa/periodos', 'POST api/v1/empresa/periodos/cerrar', 'POST api/v1/empresa/periodos/{id}/enviar', 'GET|HEAD api/v1/trabajador/pagos', 'POST api/v1/trabajador/pagos/{id}/disputar'] as $r) {
    chk(in_array($r, $routes, true), $r);
}

echo "== 3. Cierre de periodo (solo lectura) ==\n";
$owner = DB::table('users')->where('role_id', 3)->whereNull('deleted_at')->orderByDesc('last_login_at')->first();
if (! $owner) { bad('no hay dueño de empresa'); exit(1); }
$cid = (int) $owner->company_id;
$company = DB::table('companies')->where('id', $cid)->first();
echo "  empresa: {$company->name} (ciclo configurado: {$company->payment_cycle})\n";
foreach (['mensual', 'quincenal'] as $cy) {
    try {
        $n = App\Support\Periods::next($cid, $cy);
        echo "  $cy: ".($n ? "{$n['start_date']} a {$n['end_date']} | turnos {$n['shifts']} | h.extra {$n['overtime_hours']} | monto ".number_format($n['amount'], 0, ',', '.')." | trabajadores {$n['workers']} | sin salida {$n['incomplete']} | rezagados {$n['carried_over']} | se puede cerrar: ".($n['can_close'] ? 'si' : 'no') : 'nada pendiente')."\n";
    } catch (Throwable $e) { bad("$cy: ".$e->getMessage()); }
}

echo "== 4. API como dueño y como trabajador (solo GET) ==\n";
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
function call($kernel, $user, $path) {
    app('auth')->forgetGuards();
    \Laravel\Sanctum\Sanctum::actingAs($user, ['*']);
    $req = Illuminate\Http\Request::create('/api/v1'.$path, 'GET', [], [], [], ['HTTP_ACCEPT' => 'application/json']);
    try { $res = $kernel->handle($req); } catch (Throwable $e) { return [500, ['message' => $e->getMessage()]]; }
    return [$res->getStatusCode(), json_decode($res->getContent(), true)];
}
$ownerModel = App\Models\User::find($owner->id);
[$st, $b] = call($kernel, $ownerModel, '/empresa/periodos');
chk($st === 200, "GET /empresa/periodos -> $st".($st === 200 ? ' ('.count($b['data']).' periodos)' : ' '.json_encode($b)));
$pid = $st === 200 && ! empty($b['data']) ? $b['data'][0]['id'] : null;
if ($pid) {
    [$st, $b2] = call($kernel, $ownerModel, "/empresa/periodos/$pid");
    chk($st === 200, "GET /empresa/periodos/$pid -> $st".($st === 200 ? ' ('.count($b2['data']).' resumenes)' : ' '.json_encode($b2)));
    if ($st === 200 && ! empty($b2['data'])) {
        $sid = $b2['data'][0]['id'];
        [$st, $b3] = call($kernel, $ownerModel, "/empresa/liquidaciones/$sid");
        chk($st === 200, "GET /empresa/liquidaciones/$sid -> $st".($st === 200 ? ' ('.count($b3['data']).' lineas)' : ''));
    }
} else { echo "  (aun no hay periodos cerrados para probar el detalle)\n"; }
[$st, $b] = call($kernel, $ownerModel, '/empresa/turnos');
chk($st === 200, "GET /empresa/turnos -> $st");

$worker = App\Models\User::where('rut', '17894521-1')->first();
if ($worker) {
    echo "  trabajador de prueba: id {$worker->id}, role_id ".var_export($worker->role_id, true)."\n";
    foreach (['/trabajador/pagos', '/trabajador/mis-turnos?scope=past', '/trabajador/ofertas'] as $p) {
        [$st, $b] = call($kernel, $worker, $p);
        chk($st === 200, "trabajador GET $p -> $st".($st === 200 ? ' ('.count($b['data']).')' : ' '.json_encode($b)));
    }
} else { echo "  (no existe el trabajador de prueba 17894521-1)\n"; }
