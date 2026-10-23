<?php

namespace App\Support;

/**
 * Código QR dinámico de una ubicación.
 *
 * Formato: W1.<ubicación>.<ventana>.<firma>
 *  - ventana = segundos UNIX / 300 (cambia cada 5 minutos)
 *  - firma   = primeros 24 caracteres de HMAC-SHA256("<ubicación>.<ventana>", qr_secret)
 *
 * Se acepta la ventana actual y la anterior (el trabajador puede escanear justo
 * cuando cambia el código). Una foto del QR sirve como máximo 10 minutos.
 *
 * Sin dependencias de Laravel para poder probarla sola.
 */
final class Qr
{
    public const STEP = 300;
    public const PREFIX = 'W1';

    public static function window(int $ts): int
    {
        return intdiv($ts, self::STEP);
    }

    public static function secondsLeft(int $ts): int
    {
        return self::STEP - ($ts % self::STEP);
    }

    public static function make(int $locationId, string $secret, int $ts): string
    {
        $w = self::window($ts);

        return self::PREFIX.'.'.$locationId.'.'.$w.'.'.self::sign($locationId, $w, $secret);
    }

    /** @return array{0:int,1:int,2:string}|null [ubicación, ventana, firma] o null si el formato no es válido */
    public static function parse(string $code): ?array
    {
        if (! preg_match('/^W1\.(\d{1,12})\.(\d{1,12})\.([0-9a-f]{24})$/', trim($code), $m)) {
            return null;
        }

        return [(int) $m[1], (int) $m[2], $m[3]];
    }

    public static function valid(int $locationId, int $window, string $sig, string $secret, int $ts): bool
    {
        $current = self::window($ts);
        if ($window !== $current && $window !== $current - 1) {
            return false;
        }

        return hash_equals(self::sign($locationId, $window, $secret), $sig);
    }

    private static function sign(int $locationId, int $window, string $secret): string
    {
        return substr(hash_hmac('sha256', $locationId.'.'.$window, $secret), 0, 24);
    }
}
