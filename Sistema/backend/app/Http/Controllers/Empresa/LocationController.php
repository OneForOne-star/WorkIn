<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Lugares de trabajo. Cada lugar tiene un enlace secreto para la pantalla que muestra el QR.
 * El enlace se muestra una sola vez (al crear o al regenerar); en la base solo queda su hash.
 */
class LocationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = Location::forCompany($request->user()->company_id)->orderBy('name')->get();

        return response()->json(['data' => $rows->map->toApi()]);
    }

    public function store(Request $request): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120',
                Rule::unique('locations', 'name')->where('company_id', $companyId)],
            'address' => ['nullable', 'string', 'max:255'],
        ], ['name.unique' => 'Ya existe un lugar con ese nombre (incluso eliminado). Usa otro nombre.']);

        $loc = new Location(['name' => trim($data['name']), 'address' => $data['address'] ?? null, 'is_active' => true]);
        $loc->company_id = $companyId;
        $loc->qr_secret = bin2hex(random_bytes(32));
        $link = $this->issueToken($loc);
        $loc->save();

        Audit::record('location', $loc->id, 'created', $companyId, null, null, null, "Lugar {$loc->name}");

        return response()->json([
            'location' => $loc->toApi(),
            'display_url' => $this->url($loc->id, $link),
            'message' => 'Guarda el enlace de la pantalla: solo se muestra ahora. Si lo pierdes, puedes generar uno nuevo.',
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $loc = Location::forCompany($companyId)->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120',
                Rule::unique('locations', 'name')->where('company_id', $companyId)->ignore($loc->id)],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], ['name.unique' => 'Ya existe un lugar con ese nombre (incluso eliminado). Usa otro nombre.']);

        foreach ($data as $field => $value) {
            $before = $loc->{$field};
            $same = $field === 'is_active' ? (bool) $before === (bool) $value : (string) $before === (string) $value;
            if (! $same) {
                Audit::record('location', $loc->id, 'updated', $companyId, $field, $before, $value);
            }
        }
        $loc->fill($data)->save();

        return response()->json(['location' => $loc->fresh()->toApi()]);
    }

    /** Genera un enlace nuevo para la pantalla (el anterior deja de funcionar). */
    public function regenerateDisplay(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $loc = Location::forCompany($companyId)->findOrFail($id);

        $link = $this->issueToken($loc);
        $loc->save();
        Audit::record('location', $loc->id, 'updated', $companyId, null, null, null, 'Enlace de pantalla regenerado');

        return response()->json([
            'display_url' => $this->url($loc->id, $link),
            'message' => 'El enlace anterior dejó de funcionar. Guarda este: solo se muestra ahora.',
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $companyId = $request->user()->company_id;
        $loc = Location::forCompany($companyId)->findOrFail($id);

        $upcoming = DB::table('shifts')->where('location_id', $loc->id)
            ->whereNull('deleted_at')->whereIn('status', ['draft', 'published'])
            ->where('ends_at', '>', now())->exists();
        if ($upcoming) {
            return response()->json([
                'message' => 'Este lugar tiene turnos próximos. Cancélalos o márcalo como inactivo.',
                'code' => 'LOCATION_IN_USE',
            ], 409);
        }

        $loc->delete();
        Audit::record('location', $loc->id, 'deleted', $companyId);

        return response()->json(['ok' => true]);
    }

    /** Deja el hash en el modelo y devuelve el enlace en claro: "<id>.<aleatorio>". */
    private function issueToken(Location $loc): string
    {
        $raw = Str::random(48);
        $loc->display_token_hash = hash('sha256', $raw);
        $loc->display_token_rotated_at = now();

        return $raw;
    }

    private function url(?int $id, string $raw): string
    {
        return rtrim(config('workin.frontend_url'), '/').'/pantalla/'.$id.'.'.$raw;
    }
}
