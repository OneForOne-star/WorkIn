<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\User;
use App\Support\Rut;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    private const MAX_ATTEMPTS = 5;
    private const LOCK_SECONDS = 900; // 15 minutos
    private const TOKEN_DAYS = 7;
    /** Hash falso para que el tiempo de respuesta no delate si el usuario existe. */
    private const DUMMY_HASH = '$2y$12$IdN3WbhAPFDcr0JNq10pBeEhGl6Y086/yOKq7n0wQnPdAn0XHb6pO';

    /** Registro público: solo crea cuentas de trabajador. */
    public function register(Request $request): JsonResponse
    {
        $rut = Rut::normalize((string) $request->input('rut'));
        $phone = Rut::normalizePhone((string) $request->input('phone'));
        $request->merge([
            'rut' => $rut ?? trim((string) $request->input('rut')),
            'phone' => $phone ?? trim((string) $request->input('phone')),
            'email' => Str::lower(trim((string) $request->input('email'))),
        ]);

        $data = $request->validate([
            'rut' => ['required', 'string', function ($attr, $value, $fail) {
                if (! Rut::isValid($value)) {
                    $fail('El RUT no es válido. Revisa el número y el dígito verificador.');
                }
            }, 'unique:users,rut'],
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'email:rfc', 'max:190', 'unique:users,email'],
            'phone' => ['required', 'regex:/^\+569\d{8}$/'],
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
            'accept_terms' => ['accepted'],
        ], [
            'phone.regex' => 'Ingresa un celular chileno válido, por ejemplo +56 9 1234 5678.',
            'rut.unique' => 'Ese RUT ya tiene una cuenta. Si es tuyo, inicia sesión o recupera tu contraseña.',
            'email.unique' => 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
        ]);

        $user = new User([
            'rut' => $data['rut'],
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
            'email' => $data['email'],
            'phone' => $data['phone'],
            'password' => $data['password'],
            'terms_accepted_at' => now(),
        ]);
        $user->role_id = User::ROLE_WORKER;
        $user->company_id = null;
        $user->is_active = true;
        $user->save();

        $this->sendVerification($user);

        return response()->json([
            'message' => 'Cuenta creada. Te enviamos un correo para confirmar tu dirección.',
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:190'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $identifier = trim($data['identifier']);
        $key = 'login:'.Str::lower($identifier).'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            $minutes = (int) ceil(RateLimiter::availableIn($key) / 60);

            return response()->json([
                'message' => "Demasiados intentos fallidos. Intenta de nuevo en {$minutes} minuto(s).",
                'code' => 'TOO_MANY_ATTEMPTS',
            ], 429);
        }

        $user = $this->findByIdentifier($identifier);
        $passwordOk = Hash::check($data['password'], $user?->password ?? self::DUMMY_HASH);

        if (! $user || ! $passwordOk) {
            RateLimiter::hit($key, self::LOCK_SECONDS);

            return response()->json([
                'message' => 'RUT, correo o contraseña incorrectos.',
                'code' => 'INVALID_CREDENTIALS',
            ], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'message' => 'Tu cuenta está desactivada. Contacta a tu administrador.',
                'code' => 'ACCOUNT_DISABLED',
            ], 403);
        }

        if ($user->email_verified_at === null) {
            return response()->json([
                'message' => 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.',
                'code' => 'EMAIL_NOT_VERIFIED',
            ], 403);
        }

        if (in_array($user->role_id, [User::ROLE_ADMIN, User::ROLE_COMPANY_OWNER], true)) {
            $company = Company::find($user->company_id);
            if (! $company || $company->status !== 'active') {
                return response()->json([
                    'message' => 'La cuenta de tu empresa está suspendida. Contacta a WorkIn.',
                    'code' => 'COMPANY_SUSPENDED',
                ], 403);
            }
        }

        RateLimiter::clear($key);
        $user->forceFill(['last_login_at' => now()])->save();

        $expires = now()->addDays(self::TOKEN_DAYS);
        $token = $user->createToken('web', ['*'], $expires)->plainTextToken;

        return response()->json([
            'token' => $token,
            'expires_at' => $expires->toIso8601String(),
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Sesión cerrada.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
        ]);

        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'La contraseña actual no es correcta.'], 422);
        }

        $user->forceFill(['password' => $data['password']])->save();
        // cierra las demás sesiones, conserva la actual
        $current = $user->currentAccessToken()?->getKey();
        $user->tokens()->when($current, fn ($q) => $q->where('id', '!=', $current))->delete();

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    /** Enlace del correo: confirma y manda a la web. */
    public function verify(Request $request, int $id, string $hash): RedirectResponse
    {
        $front = rtrim(config('workin.frontend_url'), '/');
        $user = User::find($id);

        if (! $user || ! hash_equals(sha1($user->email), $hash)) {
            return redirect("{$front}/ingresar?verificado=0");
        }

        if ($user->email_verified_at === null) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        return redirect("{$front}/ingresar?verificado=1");
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $email = Str::lower(trim((string) $request->input('email')));
        $user = $email !== '' ? User::where('email', $email)->first() : null;

        if ($user && $user->is_active && $user->email_verified_at === null) {
            $this->sendVerification($user);
        }

        // Misma respuesta exista o no la cuenta
        return response()->json(['message' => 'Si la cuenta existe y falta confirmarla, te enviamos un correo.'], 202);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        try {
            Password::sendResetLink(['email' => Str::lower(trim($data['email']))]);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['message' => 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->merge(['email' => Str::lower(trim((string) $request->input('email')))]);
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
        ]);

        $status = Password::reset(
            $data + ['password_confirmation' => $request->input('password_confirmation')],
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => $password,
                    'email_verified_at' => $user->email_verified_at ?? now(), // el enlace prueba que controla el correo
                ])->save();
                $user->tokens()->delete();
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => 'El enlace no es válido o ya venció. Pide uno nuevo.'], 422);
        }

        return response()->json(['message' => 'Contraseña actualizada. Ya puedes ingresar.']);
    }

    private function findByIdentifier(string $identifier): ?User
    {
        if (str_contains($identifier, '@')) {
            return User::where('email', Str::lower($identifier))->first();
        }
        $rut = Rut::normalize($identifier);

        return $rut ? User::where('rut', $rut)->first() : null;
    }

    private function sendVerification(User $user): void
    {
        try {
            $user->sendEmailVerificationNotification();
        } catch (\Throwable $e) {
            report($e); // un fallo de correo no debe romper el registro
        }
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'role' => $user->roleName(),
            'company_id' => $user->company_id,
            'company' => $user->company_id ? ['id' => $user->company_id, 'name' => optional($user->company)->name] : null,
            'rut' => Rut::format($user->rut),
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
        ];
    }
}
