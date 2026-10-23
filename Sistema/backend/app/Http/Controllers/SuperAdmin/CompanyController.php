<?php

namespace App\Http\Controllers\SuperAdmin;

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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CompanyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Company::query()->with('plan')
            ->withCount(['users as admins_count' => fn ($u) => $u->whereIn('role_id', [User::ROLE_ADMIN, User::ROLE_COMPANY_OWNER])]);

        if (($s = trim((string) $request->query('search'))) !== '') {
            $digits = preg_replace('/[^0-9kK]/', '', $s);
            $q->where(function ($w) use ($s, $digits) {
                $w->where('name', 'like', "%{$s}%");
                if (strlen($digits) >= 4) {
                    $w->orWhere('tax_id', 'like', "%{$digits}%");
                }
            });
        }
        if (in_array($request->query('status'), ['active', 'suspended', 'cancelled'], true)) {
            $q->where('status', $request->query('status'));
        }

        $page = $q->orderBy('name')->paginate(20)->through(
            fn (Company $c) => $c->toApi() + ['admins_count' => (int) $c->admins_count]
        );

        return response()->json($page);
    }

    public function store(Request $request): JsonResponse
    {
        $c = (array) $request->input('company');
        $request->merge([
            'company' => [
                'name' => trim((string) ($c['name'] ?? '')),
                'tax_id' => Rut::normalize((string) ($c['tax_id'] ?? '')) ?? trim((string) ($c['tax_id'] ?? '')),
                'contact_email' => Str::lower(trim((string) ($c['contact_email'] ?? ''))),
                'contact_phone' => ($c['contact_phone'] ?? '') === '' ? null : (Rut::normalizePhone((string) $c['contact_phone']) ?? trim((string) $c['contact_phone'])),
                'plan_id' => $c['plan_id'] ?? null,
                'payment_cycle' => $c['payment_cycle'] ?? null,
                'subscription_ends_at' => $c['subscription_ends_at'] ?? null,
            ],
            'owner' => Inputs::person((array) $request->input('owner')),
        ]);

        $data = $request->validate([
            'company' => ['required', 'array'],
            'company.name' => ['required', 'string', 'max:120'],
            'company.tax_id' => ['required', 'string', new ChileanRut, 'unique:companies,tax_id'],
            'company.contact_email' => ['required', 'email:rfc', 'max:190'],
            'company.contact_phone' => ['nullable', 'string', 'max:30'],
            'company.plan_id' => ['required', 'integer', Rule::exists('plans', 'id')->where('is_active', 1)],
            'company.payment_cycle' => ['required', 'in:quincenal,mensual'],
            'company.subscription_ends_at' => ['required', 'date', 'after_or_equal:today'],
            'owner' => ['required', 'array'],
            'owner.rut' => ['required', 'string', new ChileanRut, 'unique:users,rut'],
            'owner.first_name' => ['required', 'string', 'max:80'],
            'owner.last_name' => ['required', 'string', 'max:80'],
            'owner.email' => ['required', 'email:rfc', 'max:190', 'unique:users,email'],
            'owner.phone' => ['required', 'regex:/^\+569\d{8}$/'],
        ], [
            'company.tax_id.unique' => 'Ya existe una empresa con ese RUT.',
            'owner.rut.unique' => 'Ese RUT ya tiene una cuenta en WorkIn.',
            'owner.email.unique' => 'Ese correo ya tiene una cuenta en WorkIn.',
            'owner.phone.regex' => 'Ingresa un celular chileno válido, por ejemplo +56 9 1234 5678.',
        ]);

        [$company, $owner] = DB::transaction(function () use ($data) {
            $company = new Company($data['company']);
            $company->status = 'active';
            $company->save();

            $owner = new User($data['owner'] + ['password' => Str::random(40)]);
            $owner->role_id = User::ROLE_COMPANY_OWNER;
            $owner->company_id = $company->id;
            $owner->is_active = true;
            $owner->save();

            Audit::record('company', $company->id, 'created', $company->id, null, null, $company->name);
            Audit::record('user', $owner->id, 'created', $company->id, null, null, null, 'Dueño de la empresa');

            return [$company, $owner];
        });

        $sent = Invitations::send($owner, $company);
        $company->load('plan');

        return response()->json([
            'company' => $company->toApi(),
            'owner' => $this->ownerPayload($owner),
            'invitation_sent' => $sent,
            'message' => $sent
                ? 'Empresa creada. Enviamos al dueño un correo para crear su contraseña.'
                : 'Empresa creada, pero no pudimos enviar el correo. Reenvía la invitación desde la ficha de la empresa.',
        ], 201);
    }

    public function show(Company $company): JsonResponse
    {
        $company->load('plan');
        $owner = $company->users()->where('role_id', User::ROLE_COMPANY_OWNER)->first();
        $admins = $company->users()->where('role_id', User::ROLE_ADMIN)->orderBy('first_name')->get();

        return response()->json([
            'company' => $company->toApi(),
            'owner' => $owner ? $this->ownerPayload($owner) : null,
            'admins_count' => $admins->count(),
        ]);
    }

    public function update(Request $request, Company $company): JsonResponse
    {
        $input = $request->only(['name', 'contact_email', 'contact_phone', 'plan_id', 'payment_cycle', 'subscription_ends_at']);
        if (isset($input['contact_email'])) {
            $input['contact_email'] = Str::lower(trim((string) $input['contact_email']));
        }
        if (array_key_exists('contact_phone', $input)) {
            $phone = trim((string) $input['contact_phone']);
            $input['contact_phone'] = $phone === '' ? null : (Rut::normalizePhone($phone) ?? $phone);
        }
        $request->merge($input);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'contact_email' => ['sometimes', 'required', 'email:rfc', 'max:190'],
            'contact_phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'plan_id' => ['sometimes', 'required', 'integer', Rule::exists('plans', 'id')->where('is_active', 1)],
            'payment_cycle' => ['sometimes', 'required', 'in:quincenal,mensual'],
            'subscription_ends_at' => ['sometimes', 'required', 'date'],
        ]);

        $company->fill($data);
        $old = array_intersect_key($company->getOriginal(), $company->getDirty());
        $company->save();

        foreach ($company->getChanges() as $field => $new) {
            if ($field === 'updated_at') {
                continue;
            }
            $o = $old[$field] ?? null;
            Audit::record('company', $company->id, 'updated', $company->id, $field,
                $field === 'subscription_ends_at' ? substr((string) $o, 0, 10) : $o,
                $field === 'subscription_ends_at' ? substr((string) $new, 0, 10) : $new);
        }

        $company->load('plan');

        return response()->json(['company' => $company->toApi()]);
    }

    public function suspend(Request $request, Company $company): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']]);

        if ($company->status === 'suspended') {
            return response()->json(['message' => 'La empresa ya está suspendida.'], 422);
        }

        DB::transaction(function () use ($company, $data) {
            $old = $company->status;
            $company->status = 'suspended';
            $company->save();
            $company->revokeTokens();
            Audit::record('company', $company->id, 'updated', $company->id, 'status', $old, 'suspended', $data['reason']);
        });

        return response()->json(['company' => $company->load('plan')->toApi(), 'message' => 'Empresa suspendida. Sus usuarios quedaron sin sesión.']);
    }

    public function reactivate(Request $request, Company $company): JsonResponse
    {
        $data = $request->validate([
            'subscription_ends_at' => ['required', 'date', 'after_or_equal:today'],
        ]);

        DB::transaction(function () use ($company, $data) {
            $oldStatus = $company->status;
            $oldEnds = $company->subscription_ends_at?->toDateString();
            $company->status = 'active';
            $company->subscription_ends_at = $data['subscription_ends_at'];
            $company->save();
            Audit::record('company', $company->id, 'updated', $company->id, 'status', $oldStatus, 'active', 'Reactivación');
            Audit::record('company', $company->id, 'updated', $company->id, 'subscription_ends_at', $oldEnds, substr((string) $data['subscription_ends_at'], 0, 10));
        });

        return response()->json(['company' => $company->load('plan')->toApi(), 'message' => 'Empresa reactivada.']);
    }

    public function resendOwnerInvite(Company $company): JsonResponse
    {
        $owner = $company->users()->where('role_id', User::ROLE_COMPANY_OWNER)->first();
        if (! $owner) {
            return response()->json(['message' => 'La empresa no tiene dueño registrado.'], 404);
        }

        $sent = Invitations::send($owner, $company);
        Audit::record('user', $owner->id, 'updated', $company->id, null, null, null, 'Reenvío de enlace para crear contraseña');

        return response()->json([
            'invitation_sent' => $sent,
            'message' => $sent ? 'Enviamos un nuevo enlace al correo del dueño.' : 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.',
        ], $sent ? 200 : 502);
    }

    private function ownerPayload(User $u): array
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
