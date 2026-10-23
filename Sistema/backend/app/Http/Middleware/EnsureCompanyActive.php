<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Bloquea a admins y dueños cuya empresa esté suspendida. */
class EnsureCompanyActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && in_array($user->role_id, [User::ROLE_ADMIN, User::ROLE_COMPANY_OWNER], true)) {
            $company = Company::find($user->company_id);
            if (! $company || $company->status !== 'active') {
                return response()->json([
                    'message' => 'La cuenta de tu empresa está suspendida. Contacta a WorkIn.',
                    'code' => 'COMPANY_SUSPENDED',
                ], 403);
            }
        }

        return $next($request);
    }
}
