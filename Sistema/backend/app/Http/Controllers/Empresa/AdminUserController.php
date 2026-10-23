<?php

namespace App\Http\Controllers\Empresa;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\User;
use App\Rules\ChileanRut;
use App\Support\Audit;
use App\Support\Inputs;
use App\Support\Invitations;
use App\Support\Rut;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** El dueño de la empresa gestiona a los administradores de SU empresa. */
class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $admins = User::where('company_id', $request->user()->company_id)
            ->where('role_id', User::ROLE_ADMIN)
            ->orderBy('first_name')->get()->map(fn (User $u) => $this->payload($u));

        return response()->json(['data' => $admins]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->merge(Inputs::person($request->all()));

        $data = $request->validate([
            'rut' => ['required', 'string', new ChileanRut, 'unique:users,rut'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email:rfc', 'max:190', 'unique:users,email'],
            'phone' => ['required', 'regex:/^\+569\d{8}$/'],
        ], [
            'rut.unique' => 'Ese RUT ya tiene una cuenta en WorkIn.',
            'email.unique' => 'Ese correo ya tiene una cuenta en WorkIn.',
            'phone.regex' => 'Ingresa un celular chileno válido, por ejemplo +56 9 1234 5678.',
        ]);

        $companyId = $request->user()->company_id;
        $admin = new User($data + ['password' => Str::random(40)]);
        $admin->role_id = User::ROLE_ADMIN;
        $admin->company_id = $companyId;
        $admin->is_active = true;
        $admin->save();

        Audit::record('user', $admin->id, 'created', $companyId, null, null, null, 'Administrador creado por el dueño');

        $sent = Invitations::send($admin, Company::findOrFail($companyId));

        return response()->json([
            'admin' => $this->payload($admin),
            'invitation_sent' => $sent,
            'message' => $sent
                ? 'Administrador creado. Le enviamos un correo para crear su contraseña.'
                : 'Administrador creado, pero no pudimos enviar el correo. Reenvía la invitación.',
        ], 201);
    }

    public function resendInvite(Request $request, int $id): JsonResponse
    {
        $admin = $this->mine($request, $id);
        $sent = Invitations::send($admin, Company::findOrFail($admin->company_id));
        Audit::record('user', $admin->id, 'updated', $admin->company_id, null, null, null, 'Reenvío de enlace para crear contraseña');

        return response()->json([
            'invitation_sent' => $sent,
            'message' => $sent ? 'Enviamos un nuevo enlace.' : 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
        ], $sent ? 200 : 502);
    }

    public function setActive(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $admin = $this->mine($request, $id);

        $old = $admin->is_active;
        $admin->is_active = $data['is_active'];
        $admin->save();
        if (! $admin->is_active) {
            $admin->tokens()->delete();
        }
        Audit::record('user', $admin->id, 'updated', $admin->company_id, 'is_active', (int) $old, (int) $admin->is_active);

        return response()->json(['admin' => $this->payload($admin)]);
    }

    /** Solo administradores de la misma empresa que quien consulta; si no, 404. */
    private function mine(Request $request, int $id): User
    {
        return User::where('id', $id)
            ->where('company_id', $request->user()->company_id)
            ->where('role_id', User::ROLE_ADMIN)
            ->firstOrFail();
    }

    private function payload(User $u): array
    {
        return [
            'id' => $u->id,
            'rut' => Rut::format($u->rut),
            'first_name' => $u->first_name,
            'last_name' => $u->last_name,
            'email' => $u->email,
            'phone' => $u->phone,
            'is_active' => (bool) $u->is_active,
            'activated' => $u->email_verified_at !== null,
            'last_login_at' => $u->last_login_at?->toIso8601String(),
        ];
    }
}
