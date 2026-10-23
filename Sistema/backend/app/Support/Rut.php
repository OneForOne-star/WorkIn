<?php

namespace App\Support;

final class Rut
{
    /** Devuelve "18452367-K" (sin puntos, DV en mayúscula) o null si la forma no es válida. */
    public static function normalize(string $value): ?string
    {
        $clean = strtoupper(preg_replace('/[^0-9kK]/', '', $value) ?? '');
        if (! preg_match('/^\d{7,8}[0-9K]$/', $clean)) {
            return null;
        }

        return substr($clean, 0, -1).'-'.substr($clean, -1);
    }

    public static function dv(string $body): string
    {
        $sum = 0;
        $mul = 2;
        foreach (array_reverse(str_split($body)) as $digit) {
            $sum += ((int) $digit) * $mul;
            $mul = $mul === 7 ? 2 : $mul + 1;
        }
        $r = 11 - ($sum % 11);

        return $r === 11 ? '0' : ($r === 10 ? 'K' : (string) $r);
    }

    public static function isValid(string $value): bool
    {
        $n = self::normalize($value);
        if ($n === null) {
            return false;
        }
        [$body, $dv] = explode('-', $n);

        return self::dv($body) === $dv;
    }

    /** "18452367-K" -> "18.452.367-K" */
    public static function format(string $normalized): string
    {
        [$body, $dv] = explode('-', $normalized);

        return number_format((int) $body, 0, '', '.').'-'.$dv;
    }

    /** Celular chileno -> "+56912345678", o null si no lo es. */
    public static function normalizePhone(string $value): ?string
    {
        $d = preg_replace('/\D+/', '', $value) ?? '';
        if (str_starts_with($d, '56')) {
            $d = substr($d, 2);
        }

        return preg_match('/^9\d{8}$/', $d) ? '+56'.$d : null;
    }
}
