<?php

namespace App\Http\Controllers\Publico;

use App\Http\Controllers\Controller;
use App\Support\Qr;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Pantalla del lugar de trabajo: muestra el QR que cambia cada 5 minutos.
 * No usa sesión: el enlace secreto "<id>.<clave>" es la credencial.
 */
class DisplayController extends Controller
{
    public function show(Request $request, string $token): JsonResponse
    {
        $loc = $this->resolve($token);
        if (! $loc) {
            // Misma respuesta para enlace mal formado, vencido o inexistente.
            return response()->json(['message' => 'Enlace de pantalla inválido.', 'code' => 'DISPLAY_INVALID'], 404);
        }

        $ts = time();

        return response()->json([
            'location' => $loc->name,
            'company' => $loc->company_name,
            'code' => Qr::make((int) $loc->id, $loc->qr_secret, $ts),
            'expires_in' => Qr::secondsLeft($ts),
            'step' => Qr::STEP,
        ])->header('Cache-Control', 'no-store');
    }

    private function resolve(string $token): ?object
    {
        if (! preg_match('/^(\d{1,12})\.([A-Za-z0-9]{48})$/', $token, $m)) {
            return null;
        }

        $loc = DB::table('locations as l')
            ->join('companies as c', 'c.id', '=', 'l.company_id')
            ->where('l.id', (int) $m[1])->where('l.is_active', 1)->whereNull('l.deleted_at')
            ->where('c.status', 'active')
            ->first(['l.id', 'l.name', 'l.qr_secret', 'l.display_token_hash', 'c.name as company_name']);

        if (! $loc || $loc->display_token_hash === null || ! hash_equals($loc->display_token_hash, hash('sha256', $m[2]))) {
            return null;
        }

        return $loc;
    }
}
