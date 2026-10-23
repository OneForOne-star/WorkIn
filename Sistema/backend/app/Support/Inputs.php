<?php

namespace App\Support;

use Illuminate\Support\Str;

/** Normaliza datos de entrada antes de validarlos. */
final class Inputs
{
    public static function person(array $a): array
    {
        $rut = Rut::normalize((string) ($a['rut'] ?? ''));
        $phone = Rut::normalizePhone((string) ($a['phone'] ?? ''));

        return [
            'rut' => $rut ?? trim((string) ($a['rut'] ?? '')),
            'first_name' => trim((string) ($a['first_name'] ?? '')),
            'last_name' => trim((string) ($a['last_name'] ?? '')),
            'email' => Str::lower(trim((string) ($a['email'] ?? ''))),
            'phone' => $phone ?? trim((string) ($a['phone'] ?? '')),
        ];
    }
}
