<?php

namespace App\Support;

/** Una regla de negocio no se cumple; el controlador la convierte en respuesta 409 con su código. */
class BusinessRule extends \RuntimeException
{
    public function __construct(string $message, public string $errorCode, public int $status = 409)
    {
        parent::__construct($message);
    }
}
