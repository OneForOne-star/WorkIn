<?php

namespace Tests\Unit;

use App\Support\Qr;
use App\Support\Time;
use App\Support\Windows;
use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;

/** Reglas puras de fechas, QR y ventanas de marcación (no necesitan base de datos). */
class SupportTest extends TestCase
{
    private function utc(string $s): DateTimeImmutable
    {
        return new DateTimeImmutable($s, new DateTimeZone('UTC'));
    }

    // ---- Time ----

    public function test_fecha_sin_zona_se_interpreta_en_santiago_verano(): void
    {
        // Enero: Chile está en horario de verano (UTC-3)
        $this->assertSame('2027-01-15 11:00:00', Time::toDb(Time::parse('2027-01-15T08:00')));
    }

    public function test_fecha_sin_zona_se_interpreta_en_santiago_invierno(): void
    {
        // Julio: horario de invierno (UTC-4)
        $this->assertSame('2027-07-15 12:00:00', Time::toDb(Time::parse('2027-07-15T08:00')));
    }

    public function test_fecha_con_zona_respeta_la_zona(): void
    {
        $this->assertSame('2027-01-15 08:00:00', Time::toDb(Time::parse('2027-01-15T08:00:00Z')));
        $this->assertSame('2027-01-15 13:00:00', Time::toDb(Time::parse('2027-01-15T08:00:00-05:00')));
    }

    public function test_fecha_invalida_lanza_error(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Time::parse('mañana temprano');
    }

    public function test_iso_siempre_sale_en_utc_con_z(): void
    {
        $this->assertSame('2027-01-15T11:00:00Z', Time::iso('2027-01-15 11:00:00'));
        $this->assertNull(Time::iso(null));
    }

    public function test_human_muestra_hora_de_santiago(): void
    {
        $this->assertSame('vie 15 ene 2027, 08:00', Time::human('2027-01-15 11:00:00'));
    }

    public function test_hoy_local_cambia_de_dia_segun_santiago(): void
    {
        // 02:00 UTC del 16 de enero = 23:00 del 15 en Santiago
        $this->assertSame('2027-01-15', Time::todayLocal($this->utc('2027-01-16 02:00:00')));
    }

    public function test_limites_del_mes_en_santiago(): void
    {
        [$start, $end] = Time::monthBoundsUtc($this->utc('2027-01-20 12:00:00'));
        $this->assertSame('2027-01-01 03:00:00', $start); // medianoche de Santiago en enero = 03:00 UTC
        $this->assertSame('2027-02-01 03:00:00', $end);
    }

    // ---- Qr ----

    public function test_qr_valido_en_su_ventana(): void
    {
        $ts = 1_800_000_000;
        $code = Qr::make(7, 'secreto', $ts);
        [$loc, $win, $sig] = Qr::parse($code);

        $this->assertSame(7, $loc);
        $this->assertTrue(Qr::valid($loc, $win, $sig, 'secreto', $ts));
        $this->assertTrue(Qr::valid($loc, $win, $sig, 'secreto', $ts + 299 - ($ts % 300)));
    }

    public function test_qr_sirve_hasta_la_ventana_siguiente_y_luego_vence(): void
    {
        $ts = 1_800_000_000;
        [$loc, $win, $sig] = Qr::parse(Qr::make(7, 'secreto', $ts));

        $this->assertTrue(Qr::valid($loc, $win, $sig, 'secreto', $ts + 300));   // ventana anterior aún vale
        $this->assertFalse(Qr::valid($loc, $win, $sig, 'secreto', $ts + 600));  // 2 ventanas después: vencido
    }

    public function test_qr_del_futuro_no_vale(): void
    {
        $ts = 1_800_000_000;
        [$loc, $win, $sig] = Qr::parse(Qr::make(7, 'secreto', $ts + 900));
        $this->assertFalse(Qr::valid($loc, $win, $sig, 'secreto', $ts));
    }

    public function test_qr_con_otro_secreto_o_otra_ubicacion_no_vale(): void
    {
        $ts = 1_800_000_000;
        [$loc, $win, $sig] = Qr::parse(Qr::make(7, 'secreto', $ts));

        $this->assertFalse(Qr::valid($loc, $win, $sig, 'otro-secreto', $ts));
        $this->assertFalse(Qr::valid(8, $win, $sig, 'secreto', $ts));
    }

    public function test_qr_mal_formado_se_rechaza(): void
    {
        $this->assertNull(Qr::parse('hola'));
        $this->assertNull(Qr::parse('W1.7.123.XYZ'));
        $this->assertNull(Qr::parse("W1.7.123.aaaaaaaaaaaaaaaaaaaaaaaa\nextra"));
    }

    public function test_segundos_restantes(): void
    {
        $this->assertSame(300, Qr::secondsLeft(1_800_000_000 - (1_800_000_000 % 300)));
        $this->assertSame(1, Qr::secondsLeft(1_800_000_000 - (1_800_000_000 % 300) + 299));
    }

    // ---- Windows ----

    public function test_ventana_de_entrada_es_mas_menos_30_minutos(): void
    {
        $start = $this->utc('2027-01-15 11:00:00');
        $this->assertTrue(Windows::inWindow($start, $this->utc('2027-01-15 10:30:00')));
        $this->assertTrue(Windows::inWindow($start, $this->utc('2027-01-15 11:30:00')));
        $this->assertFalse(Windows::inWindow($start, $this->utc('2027-01-15 10:29:59')));
        $this->assertFalse(Windows::inWindow($start, $this->utc('2027-01-15 11:30:01')));
    }

    public function test_ventana_de_salida_es_mas_menos_30_minutos(): void
    {
        $end = $this->utc('2027-01-15 19:00:00');
        $this->assertTrue(Windows::outWindow($end, $this->utc('2027-01-15 18:30:00')));
        $this->assertTrue(Windows::outWindow($end, $this->utc('2027-01-15 19:30:00')));
        $this->assertFalse(Windows::outWindow($end, $this->utc('2027-01-15 19:31:00')));
    }
}
