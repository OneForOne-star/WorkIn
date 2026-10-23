<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Rate;
use App\Support\Audit;
use App\Support\Time;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Tarifas de la empresa: pago por turno y por hora extra. */
class RateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rates = Rate::forCompany($request->user()->company_id)
            ->orderByDesc('valid_from')->orderByDesc('id')->get();

        return response()->json([
            'data' => $rates->map->toApi(),
            'current_id' => Rate::currentFor($request->user()->company_id)?->id,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $companyId = $request->user()->company_id;

        $rate = new Rate($data);
        $rate->company_id = $companyId;
        $rate->save();
        Audit::record('rate', $rate->id, 'created', $companyId, null, null, null, "Tarifa {$rate->name}");

        return response()->json(['rate' => $rate->toApi()], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $rate = Rate::forCompany($request->user()->company_id)->findOrFail($id);
        $data = $this->validated($request, $rate);

        // Una tarifa que ya se usó en asistencias no cambia sus montos: se crea otra.
        // Una tarifa ya fijada en algún turno (o usada en una asistencia) no cambia sus montos.
        $used = DB::table('shifts')->where('rate_id', $rate->id)->exists()
            || DB::table('attendances')->where('rate_id', $rate->id)->exists();
        $moneyChanged = (int) $data['shift_amount'] !== $rate->shift_amount
            || (int) $data['overtime_hour_amount'] !== $rate->overtime_hour_amount;
        if ($used && $moneyChanged) {
            return response()->json([
                'message' => 'Esta tarifa ya está fijada en turnos publicados o pasados. Para cambiar los montos, crea una tarifa nueva y ponle fecha de término a la anterior.',
                'code' => 'RATE_IN_USE',
            ], 409);
        }

        foreach ($data as $field => $value) {
            $before = $rate->{$field};
            $before = $before instanceof \DateTimeInterface ? $before->format('Y-m-d') : $before;
            if ((string) $before !== (string) $value) {
                Audit::record('rate', $rate->id, 'updated', $rate->company_id, $field, $before, $value);
            }
        }
        $rate->fill($data)->save();

        return response()->json(['rate' => $rate->fresh()->toApi()]);
    }

    private function validated(Request $request, ?Rate $existing): array
    {
        $request->merge([
            'valid_from' => $request->input('valid_from') ?: ($existing?->valid_from?->format('Y-m-d') ?? Time::todayLocal()),
        ]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'shift_amount' => ['required', 'integer', 'min:1', 'max:100000000'],
            'overtime_hour_amount' => ['required', 'integer', 'min:0', 'max:100000000'],
            'valid_from' => ['required', 'date_format:Y-m-d'],
            'valid_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:valid_from'],
        ]);
        $data['name'] = trim($data['name']);

        return $data;
    }
}
