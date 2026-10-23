<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyInfoController extends Controller
{
    /** Resumen de la empresa del usuario que consulta (nunca de otra). */
    public function show(Request $request): JsonResponse
    {
        $company = Company::with('plan')->findOrFail($request->user()->company_id);

        return response()->json(['company' => $company->toApi()]);
    }
}
