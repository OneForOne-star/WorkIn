<?php

namespace App\Http\Controllers\Trabajador;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Rate;
use App\Support\Audit;
use App\Support\Qr;
use App\Support\Time;
use App\Support\Windows;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * El trabajador escanea el QR del lugar y se registra su entrada o su salida.
 * Entrada: desde 30 min antes hasta 30 min después del inicio.
 * Salida:  desde 30 min antes hasta 30 min después del término.
 */
class ScanController extends Controller
{
    public function scan(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:100']]);
        $userId = $request->user()->id;

        $parsed = Qr::parse($data['code']);
        $now = Time::nowUtc();
        $loc = $parsed ? DB::table('locations')->where('id', $parsed[0])->whereNull('deleted_at')->first() : null;

        if (! $parsed || ! $loc || ! $loc->is_active || ! Qr::valid($parsed[0], $parsed[1], $parsed[2], $loc->qr_secret, $now->getTimestamp())) {
            return $this->fail('El código QR no es válido o ya venció. Escanea el que está en pantalla ahora.', 'QR_INVALID', 422);
        }

        // Turnos aceptados del trabajador en ese lugar cuya ventana de marcación está cerca de ahora.
        $from = Time::toDb($now->modify('-'.(Windows::MINUTES + 24 * 60).' minutes'));
        $to = Time::toDb($now->modify('+'.(Windows::MINUTES + 24 * 60).' minutes'));

        $candidates = DB::table('shift_assignments as a')
            ->join('shifts as s', 's.id', '=', 'a.shift_id')
            ->leftJoin('attendances as t', fn ($j) => $j->on('t.shift_assignment_id', '=', 'a.id')->whereNull('t.deleted_at'))
            ->where('a.user_id', $userId)->where('a.status', 'accepted')
            ->where('s.location_id', $loc->id)->where('s.company_id', $loc->company_id)
            ->where('s.status', 'published')->whereNull('s.deleted_at')
            ->where('s.ends_at', '>=', $from)->where('s.starts_at', '<=', $to)
            ->orderBy('s.starts_at')
            ->get(['a.id as assignment_id', 'a.company_id', 's.title', 's.starts_at', 's.ends_at', 's.rate_id as shift_rate_id',
                't.id as attendance_id', 't.check_in_at', 't.check_out_at']);

        // 1) Salida: hay una entrada abierta y estamos en la ventana de salida.
        foreach ($candidates as $c) {
            $end = new \DateTimeImmutable($c->ends_at, new \DateTimeZone('UTC'));
            if ($c->attendance_id && $c->check_in_at && ! $c->check_out_at && Windows::outWindow($end, $now)) {
                return $this->checkOut($c, $now, $userId);
            }
        }
        // 2) Entrada: aún no marcó y estamos en la ventana de entrada.
        foreach ($candidates as $c) {
            $start = new \DateTimeImmutable($c->starts_at, new \DateTimeZone('UTC'));
            if (! $c->attendance_id && Windows::inWindow($start, $now)) {
                return $this->checkIn($c, $now, $userId);
            }
        }

        // Nada coincide: se explica según el turno más cercano a este momento.
        $nearest = $candidates->sortBy(function ($c) use ($now) {
            $t = $now->getTimestamp();
            $s = (new \DateTimeImmutable($c->starts_at, new \DateTimeZone('UTC')))->getTimestamp();
            $e = (new \DateTimeImmutable($c->ends_at, new \DateTimeZone('UTC')))->getTimestamp();

            return min(abs($t - $s), abs($t - $e));
        })->first();

        if (! $nearest) {
            // ¿Tiene un turno aceptado más adelante en este lugar? Se le dice cuándo podrá marcar.
            $next = DB::table('shift_assignments as a')->join('shifts as s', 's.id', '=', 'a.shift_id')
                ->where('a.user_id', $userId)->where('a.status', 'accepted')
                ->where('s.location_id', $loc->id)->where('s.company_id', $loc->company_id)
                ->where('s.status', 'published')->whereNull('s.deleted_at')
                ->where('s.starts_at', '>', Time::toDb($now))->orderBy('s.starts_at')->value('s.starts_at');
            if ($next) {
                return $this->fail('Aún no es hora: tu próximo turno aquí empieza el '.Time::human($next).'. Podrás marcar desde 30 minutos antes.', 'CHECKIN_NOT_OPEN', 409);
            }

            return $this->fail('No tienes un turno aceptado en este lugar para esta hora.', 'NO_SHIFT', 409);
        }
        if ($nearest->check_out_at) {
            return $this->fail('Ya marcaste entrada y salida en este turno.', 'ALREADY_DONE', 409);
        }
        if ($nearest->attendance_id && $nearest->check_in_at) {
            $end = new \DateTimeImmutable($nearest->ends_at, new \DateTimeZone('UTC'));
            if ($now > $end) {
                return $this->fail('La ventana para marcar salida ya pasó. Pide al administrador que registre tu salida.', 'CHECKOUT_CLOSED', 409);
            }

            return $this->fail('Ya marcaste tu entrada. La salida se habilita 30 minutos antes del término del turno.', 'CHECKOUT_NOT_OPEN', 409);
        }
        $start = new \DateTimeImmutable($nearest->starts_at, new \DateTimeZone('UTC'));
        if ($now > $start) {
            return $this->fail('La ventana para marcar entrada ya pasó. Pide al administrador que registre tu asistencia.', 'CHECKIN_CLOSED', 409);
        }

        return $this->fail('Aún no puedes marcar entrada: se habilita 30 minutos antes del inicio del turno.', 'CHECKIN_NOT_OPEN', 409);
    }

    private function checkIn(object $c, \DateTimeImmutable $now, int $userId): JsonResponse
    {
        // La tarifa es la que quedó fija en el turno; solo los turnos antiguos sin tarifa usan la vigente.
        $rate = $c->shift_rate_id ? Rate::find($c->shift_rate_id) : Rate::resolveFor((int) $c->company_id, $userId);
        if (! $rate) {
            return $this->fail('Tu empresa aún no tiene una tarifa vigente. Avísale al administrador para que te marque la entrada.', 'NO_RATE', 409);
        }

        $att = new Attendance;
        $att->company_id = $c->company_id;
        $att->shift_assignment_id = $c->assignment_id;
        $att->check_in_at = Time::toDb($now);
        $att->check_in_method = 'qr';
        $att->rate_id = $rate->id;
        try {
            $att->save();
        } catch (\Illuminate\Database\QueryException $e) {
            if ($e->getCode() === '23000') { // doble escaneo simultáneo
                return $this->fail('Tu entrada ya estaba registrada.', 'ALREADY_DONE', 409);
            }
            throw $e;
        }
        Audit::record('attendance', $att->id, 'created', (int) $c->company_id, 'check_in_at', null, Time::toDb($now), 'Entrada por QR');

        return response()->json([
            'action' => 'check_in',
            'message' => 'Entrada registrada. ¡Buen turno!',
            'title' => $c->title,
            'at' => Time::iso($now),
        ], 201);
    }

    private function checkOut(object $c, \DateTimeImmutable $now, int $userId): JsonResponse
    {
        $att = Attendance::forCompany((int) $c->company_id)->findOrFail($c->attendance_id);
        $att->check_out_at = Time::toDb($now);
        $att->check_out_method = 'qr';
        $att->save();
        Audit::record('attendance', $att->id, 'updated', (int) $c->company_id, 'check_out_at', null, Time::toDb($now), 'Salida por QR');

        return response()->json([
            'action' => 'check_out',
            'message' => 'Salida registrada. ¡Gracias por tu trabajo!',
            'title' => $c->title,
            'at' => Time::iso($now),
        ]);
    }

    private function fail(string $message, string $code, int $status): JsonResponse
    {
        return response()->json(['message' => $message, 'code' => $code], $status);
    }
}
