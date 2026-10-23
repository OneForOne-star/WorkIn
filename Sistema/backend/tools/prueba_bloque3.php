<?php
/**
 * Prueba de humo del bloque 3 contra tu propio servidor.
 *
 * Uso (desde ~/workin-api):   php tools/prueba_bloque3.php
 *
 * Pide el RUT y la contraseña del DUEÑO o de un ADMIN de la empresa (la contraseña no se muestra
 * ni se guarda). Crea un trabajador de prueba, una tarifa, un lugar y dos turnos que se cruzan,
 * revisa las reglas y deja los turnos cancelados. Puedes correrlo varias veces.
 */

if (PHP_SAPI !== 'cli') {
    exit("Solo desde la terminal.\n");
}

const DEFAULT_BASE = 'https://api-workin.otecnya.cl/api/v1';

function ask(string $label, ?string $default = null, bool $hidden = false): string
{
    echo $label.($default ? " [{$default}]" : '').': ';
    if ($hidden) {
        shell_exec('stty -echo 2>/dev/null');
    }
    $v = trim((string) fgets(STDIN));
    if ($hidden) {
        shell_exec('stty echo 2>/dev/null');
        echo "\n";
    }

    return $v === '' && $default !== null ? $default : $v;
}

function call(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    global $BASE;
    $ch = curl_init($BASE.$path);
    $headers = ['Accept: application/json', 'Content-Type: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer '.$token;
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 40,
        CURLOPT_POSTFIELDS => $body !== null ? json_encode($body) : null,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $status, 'json' => json_decode((string) $raw, true) ?? [], 'raw' => $raw];
}

$pass = 0;
$fail = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    echo ($ok ? '  [ OK ] ' : '  [FALLA] ').$name.(! $ok && $detail ? "\n         → ".$detail : '')."\n";
}

function must(bool $ok, string $why): void
{
    if (! $ok) {
        echo "\nSe detiene aquí porque lo siguiente depende de este paso: {$why}\n";
        exit(1);
    }
}

function dv(string $body): string
{
    $sum = 0;
    $mul = 2;
    for ($i = strlen($body) - 1; $i >= 0; $i--) {
        $sum += (int) $body[$i] * $mul;
        $mul = $mul === 7 ? 2 : $mul + 1;
    }
    $r = 11 - ($sum % 11);

    return $r === 11 ? '0' : ($r === 10 ? 'K' : (string) $r);
}

$BASE = rtrim(ask('Dirección de la API', DEFAULT_BASE), '/');
$ownerRut = ask('RUT del dueño o administrador de la empresa');
$ownerPass = ask('Contraseña (no se muestra)', null, true);

echo "\n1) Ingreso de la empresa\n";
$r = call('POST', '/auth/login', ['identifier' => $ownerRut, 'password' => $ownerPass]);
check('login del dueño/admin', $r['status'] === 200 && isset($r['json']['token']), "HTTP {$r['status']}: ".($r['json']['message'] ?? $r['raw']));
if ($r['status'] !== 200) {
    exit("\nNo se pudo ingresar; no sigo.\n");
}
$O = $r['json']['token'];
$role = $r['json']['user']['role'] ?? '';
if (! in_array($role, ['admin', 'company_owner'], true)) {
    exit("\nEse RUT es de un usuario con rol «{$role}», no de una empresa. Usa el RUT del DUEÑO (o de un administrador) de la empresa, no el del Super Admin de WorkIn.\n");
}

echo "\n2) Tarifa y lugar\n";
$r = call('GET', '/empresa/tarifas', null, $O);
$hasRate = $r['status'] === 200 && ! empty($r['json']['current_id']);
if (! $hasRate) {
    $r = call('POST', '/empresa/tarifas', ['name' => 'Tarifa base', 'shift_amount' => 30000, 'overtime_hour_amount' => 5000], $O);
    check('crear tarifa vigente', $r['status'] === 201, "HTTP {$r['status']}: ".json_encode($r['json']));
} else {
    check('ya hay tarifa vigente', true);
}

$locName = 'Lugar de prueba '.date('His');
$r = call('POST', '/empresa/lugares', ['name' => $locName, 'address' => 'Dirección de prueba 123'], $O);
check('crear lugar', $r['status'] === 201 && ! empty($r['json']['display_url']), "HTTP {$r['status']}: ".json_encode($r['json']));
must($r['status'] === 201 || ! empty($r['json']['location']['id']), 'no se pudo crear el lugar');
$locId = $r['json']['location']['id'] ?? 0;
$displayUrl = $r['json']['display_url'] ?? '';
$token = $displayUrl ? substr($displayUrl, strrpos($displayUrl, '/pantalla/') + 10) : '';

$r = call('GET', '/pantalla/'.$token);
check('la pantalla entrega un QR', $r['status'] === 200 && str_starts_with($r['json']['code'] ?? '', 'W1.'), "HTTP {$r['status']}");
$qr = $r['json']['code'] ?? '';
$r = call('GET', '/pantalla/'.substr($token, 0, -3).'abc');
check('un enlace de pantalla incorrecto se rechaza', $r['status'] === 404);

echo "\n3) Trabajador de prueba\n";
$body = (string) random_int(10000000, 24999999);
$rut = $body.'-'.dv($body);
$ghostBody = (string) random_int(90000000, 99999999);
$ghostRut = $ghostBody.'-'.dv($ghostBody); // RUT válido que no existe en WorkIn
$email = 'prueba'.date('YmdHis').'@example.com';
$wPass = 'Prueba'.random_int(100000, 999999).'x';
$r = call('POST', '/auth/register', [
    'rut' => $rut, 'first_name' => 'Prueba', 'last_name' => 'Trabajador', 'email' => $email, 'phone' => '+569'.random_int(10000000, 99999999),
    'password' => $wPass, 'password_confirmation' => $wPass, 'accept_terms' => true,
]);
check('registrar trabajador', $r['status'] === 201, "HTTP {$r['status']}: ".json_encode($r['json']));

$artisan = dirname(__DIR__).'/artisan';
$out = shell_exec(escapeshellarg(PHP_BINARY).' '.escapeshellarg($artisan).' workin:verify-email '.escapeshellarg($email).' 2>&1');
check('confirmar su correo (soporte)', str_contains((string) $out, 'confirmado'), trim((string) $out));

$r = call('POST', '/auth/login', ['identifier' => $rut, 'password' => $wPass]);
check('login del trabajador con RUT', $r['status'] === 200, "HTTP {$r['status']}: ".json_encode($r['json']));
$W = $r['json']['token'] ?? '';

echo "\n4) Bolsa de trabajadores\n";
$r = call('POST', '/empresa/trabajadores/invitar', ['rut' => $ghostRut], $O);
check('RUT inexistente → "pídele que se registre" (usa 1 de 5 búsquedas)', $r['status'] === 404 && ($r['json']['code'] ?? '') === 'WORKER_NOT_FOUND', "HTTP {$r['status']}: ".json_encode($r['json']));
$r = call('POST', '/empresa/trabajadores/invitar', ['rut' => $rut], $O);
check('invitar al trabajador por RUT', $r['status'] === 201, "HTTP {$r['status']}: ".json_encode($r['json']));
must($r['status'] === 201, 'no se pudo invitar al trabajador');
$r = call('POST', '/empresa/trabajadores/invitar', ['rut' => $rut], $O);
check('invitar de nuevo → ya tiene invitación', $r['status'] === 409);

$r = call('GET', '/trabajador/ofertas', null, $W);
check('sin aceptar la invitación no ve ofertas', $r['status'] === 200 && count($r['json']['data'] ?? []) === 0);
$r = call('GET', '/trabajador/invitaciones', null, $W);
$invId = $r['json']['data'][0]['id'] ?? 0;
check('el trabajador ve la invitación', $invId > 0);
$r = call('POST', "/trabajador/invitaciones/{$invId}/aceptar", [], $W);
check('el trabajador acepta la invitación', $r['status'] === 200, "HTTP {$r['status']}: ".json_encode($r['json']));
must($r['status'] === 200, 'la invitación no fue aceptada');

echo "\n5) Turnos que se cruzan\n";
$tz = new DateTimeZone('America/Santiago');
$day = (new DateTimeImmutable('now', $tz))->modify('+3 days')->format('Y-m-d');
$mk = fn (string $title, string $from, string $to) => call('POST', '/empresa/turnos', [
    'location_id' => $locId, 'title' => $title, 'starts_at' => "{$day}T{$from}", 'ends_at' => "{$day}T{$to}", 'slots' => 1,
], $O);
$s1 = $mk('Turno prueba A (08-16)', '08:00', '16:00');
$s2 = $mk('Turno prueba B (12-20)', '12:00', '20:00');
check('publicar turno A', $s1['status'] === 201, "HTTP {$s1['status']}: ".json_encode($s1['json']));
check('publicar turno B (se cruza con A)', $s2['status'] === 201, "HTTP {$s2['status']}: ".json_encode($s2['json']));
$id1 = $s1['json']['shift']['id'] ?? 0;
$id2 = $s2['json']['shift']['id'] ?? 0;
check('el turno se guarda en UTC y se devuelve con Z', str_ends_with($s1['json']['shift']['starts_at'] ?? '', 'Z'));

$r = call('GET', '/trabajador/ofertas', null, $W);
$ids = array_column($r['json']['data'] ?? [], 'id');
check('el trabajador ve ambas ofertas', in_array($id1, $ids, true) && in_array($id2, $ids, true), json_encode($ids));

$r1 = call('POST', "/trabajador/ofertas/{$id1}/postular", [], $W);
$r2 = call('POST', "/trabajador/ofertas/{$id2}/postular", [], $W);
check('postula al turno A', $r1['status'] === 201, json_encode($r1['json']));
check('postula al turno B aunque se cruce (permitido)', $r2['status'] === 201, json_encode($r2['json']));
$r = call('POST', "/trabajador/ofertas/{$id1}/postular", [], $W);
check('no puede postular dos veces', $r['status'] === 409);

$apps1 = call('GET', "/empresa/turnos/{$id1}/postulaciones", null, $O)['json']['data'][0]['id'] ?? 0;
$apps2 = call('GET', "/empresa/turnos/{$id2}/postulaciones", null, $O)['json']['data'][0]['id'] ?? 0;
$r = call('POST', "/empresa/postulaciones/{$apps1}/aceptar", [], $O);
check('la empresa acepta al trabajador en A', $r['status'] === 200, "HTTP {$r['status']}: ".json_encode($r['json']));
$r = call('POST', "/empresa/postulaciones/{$apps2}/aceptar", [], $O);
check('aceptarlo también en B se bloquea por choque de horario', $r['status'] === 409 && ($r['json']['code'] ?? '') === 'SHIFT_OVERLAP', "HTTP {$r['status']}: ".json_encode($r['json']));

echo "\n6) Asistencia por QR\n";
$r = call('POST', '/trabajador/asistencia/escanear', ['code' => $qr], $W);
check('escanear antes de la ventana → "aún no puedes marcar"', $r['status'] === 409 && ($r['json']['code'] ?? '') === 'CHECKIN_NOT_OPEN', "HTTP {$r['status']}: ".json_encode($r['json']));
$r = call('POST', '/trabajador/asistencia/escanear', ['code' => 'W1.'.$locId.'.1.aaaaaaaaaaaaaaaaaaaaaaaa'], $W);
check('un QR falso se rechaza', $r['status'] === 422 && ($r['json']['code'] ?? '') === 'QR_INVALID');

echo "\n7) Aislamiento y permisos\n";
$r = call('GET', '/empresa/turnos', null, $W);
check('un trabajador no entra a rutas de empresa', $r['status'] === 403);
$r = call('GET', '/trabajador/ofertas', null, $O);
check('la empresa no entra a rutas de trabajador', $r['status'] === 403);

echo "\n8) Limpieza\n";
foreach ([$id1, $id2] as $sid) {
    if ($sid) {
        $r = call('POST', "/empresa/turnos/{$sid}/cancelar", ['reason' => 'Prueba automática'], $O);
        check("cancelar turno {$sid}", $r['status'] === 200, "HTTP {$r['status']}: ".json_encode($r['json']));
    }
}
$r = call('GET', '/trabajador/mis-turnos', null, $W);
check('el trabajador ya no tiene turnos vigentes', $r['status'] === 200 && count(array_filter($r['json']['data'] ?? [], fn ($x) => in_array($x['status'], ['accepted', 'applied'], true))) === 0);

echo "\nResultado: {$pass} bien, {$fail} con falla.\n";
echo "Quedaron en la base: el trabajador de prueba ({$email}), el lugar «{$locName}» y los turnos cancelados.\n";
exit($fail > 0 ? 1 : 0);
