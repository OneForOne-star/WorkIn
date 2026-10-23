<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Uso: ->middleware('role:admin,company_owner') */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        $allowed = array_map(fn ($r) => User::ROLES[$r] ?? null, $roles);

        if (! $user || ! in_array($user->role_id, $allowed, true)) {
            return response()->json(['message' => 'No tienes permiso para esta acción.', 'code' => 'FORBIDDEN'], 403);
        }

        return $next($request);
    }
}
