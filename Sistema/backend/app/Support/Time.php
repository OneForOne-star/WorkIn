<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use InvalidArgumentException;

/**
 * Manejo de fechas de turnos.
 *
 * Regla: la base guarda TODO en UTC (DATETIME sin zona). La API recibe fechas con
 * zona ("2026-11-03T08:00:00-03:00") o sin zona ("2026-11-03T08:00"), y en ese caso
 * se interpretan como hora de Santiago. La API devuelve siempre ISO 8601 en UTC con "Z";
 * la web las muestra en hora de Santiago. Así el horario de verano no rompe nada.
 *
 * Sin dependencias de Laravel para poder probarla sola.
 */
final class Time
{
    public const LOCAL_TZ = 'America/Santiago';

    public static function local(): DateTimeZone
    {
        return new DateTimeZone(self::LOCAL_TZ);
    }

    /** Texto recibido de la API -> instante en UTC. Lanza InvalidArgumentException si no es una fecha. */
    public static function parse(string $value): DateTimeImmutable
    {
        $value = trim($value);
        if ($value === '' || ! preg_match('/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/', $value)) {
            throw new InvalidArgumentException('Fecha inválida');
        }

        try {
            $dt = new DateTimeImmutable($value, self::local());
        } catch (\Throwable) {
            throw new InvalidArgumentException('Fecha inválida');
        }

        return $dt->setTimezone(new DateTimeZone('UTC'));
    }

    /** Instante -> texto para guardar en la base (UTC). */
    public static function toDb(DateTimeInterface $dt): string
    {
        return DateTimeImmutable::createFromInterface($dt)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    /** Valor de la base (UTC, sin zona) o instante -> ISO 8601 con "Z". */
    public static function iso(DateTimeInterface|string|null $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $dt = $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)
            : new DateTimeImmutable($value, new DateTimeZone('UTC'));

        return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    /** Texto legible en español y hora de Santiago, para correos: "mar 3 nov 2026, 08:00". */
    public static function human(DateTimeInterface|string|null $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        $dt = $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)
            : new DateTimeImmutable($value, new DateTimeZone('UTC'));
        $l = $dt->setTimezone(self::local());

        $days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        $months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

        return sprintf(
            '%s %d %s %d, %s',
            $days[(int) $l->format('w')],
            (int) $l->format('j'),
            $months[(int) $l->format('n') - 1],
            (int) $l->format('Y'),
            $l->format('H:i')
        );
    }

    public static function nowUtc(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    /** Fecha de hoy en Santiago (para vigencia de tarifas). */
    public static function todayLocal(?DateTimeInterface $now = null): string
    {
        $now = $now ? DateTimeImmutable::createFromInterface($now) : self::nowUtc();

        return $now->setTimezone(self::local())->format('Y-m-d');
    }

    /** Inicio y fin (UTC, para la base) del mes de Santiago que contiene $at. */
    public static function monthBoundsUtc(?DateTimeInterface $at = null): array
    {
        $at = $at ? DateTimeImmutable::createFromInterface($at) : self::nowUtc();
        $local = $at->setTimezone(self::local());
        $start = $local->modify('first day of this month')->setTime(0, 0, 0);
        $end = $start->modify('+1 month');

        return [self::toDb($start), self::toDb($end)];
    }
}
