<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;

class PlanController extends Controller
{
    public function index(): JsonResponse
    {
        $plans = Plan::where('is_active', true)->orderBy('id')->get()->map(fn (Plan $p) => [
            'id' => (int) $p->id,
            'name' => $p->name,
            'max_shifts_per_month' => $p->max_shifts_per_month,
            'price_monthly' => $p->price_monthly,
        ]);

        return response()->json(['data' => $plans]);
    }
}
