<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeInterface;

/**
 * Ventanas de marcación: entrada desde 30 min antes hasta 30 min después del inicio;
 * salida desde 30 min antes hasta 30 min después del término.
 * Sin dependencias de Laravel para poder probarla sola.
 */
final class Windows
{
    public const MINUTES = 30;

    public static function inWindow(DateTimeInterface $shiftStart, DateTimeInterface $now): bool
    {
        return self::within($shiftStart, $now);
    }

    public static function outWindow(DateTimeInterface $shiftEnd, DateTimeInterface $now): bool
    {
        return self::within($shiftEnd, $now);
    }

    private static function within(DateTimeInterface $center, DateTimeInterface $now): bool
    {
        $c = DateTimeImmutable::createFromInterface($center)->getTimestamp();
        $n = DateTimeImmutable::createFromInterface($now)->getTimestamp();

        return abs($n - $c) <= self::MINUTES * 60;
    }
}
