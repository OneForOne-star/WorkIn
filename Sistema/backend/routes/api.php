<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\Empresa\AdminUserController;
use App\Http\Controllers\Empresa\ApplicationController;
use App\Http\Controllers\Empresa\AttendanceController;
use App\Http\Controllers\Empresa\CompanyInfoController;
use App\Http\Controllers\Empresa\LocationController;
use App\Http\Controllers\Empresa\OvertimeRequestController;
use App\Http\Controllers\Empresa\PeriodController;
use App\Http\Controllers\Empresa\RateController;
use App\Http\Controllers\Empresa\ShiftController;
use App\Http\Controllers\Empresa\WorkerPoolController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\Publico\DisplayController;
use App\Http\Controllers\SuperAdmin\CompanyController;
use App\Http\Controllers\SuperAdmin\PlanController;
use App\Http\Controllers\Trabajador\MyShiftsController;
use App\Http\Controllers\Trabajador\OfferController;
use App\Http\Controllers\Trabajador\OvertimeRequestController as WorkerOvertimeController;
use App\Http\Controllers\Trabajador\PaymentController;
use App\Http\Controllers\Trabajador\PoolController;
use App\Http\Controllers\Trabajador\ScanController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/ping', fn () => ['app' => 'WorkIn', 'status' => 'ok']);

    // ---------- Pantalla pública del QR (la credencial es el enlace secreto) ----------
    Route::get('pantalla/{token}', [DisplayController::class, 'show'])->middleware('throttle:60,1');

    // ---------- Autenticación ----------
    Route::prefix('auth')->group(function () {
        Route::post('register', [AuthController::class, 'register'])->middleware('throttle:10,1');
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:20,1');
        Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
        Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');
        Route::post('invitation/accept', [InvitationController::class, 'accept'])->middleware('throttle:10,1');
        Route::post('email/resend', [AuthController::class, 'resendVerification'])->middleware('throttle:5,1');
        Route::get('verify/{id}/{hash}', [AuthController::class, 'verify'])
            ->middleware(['signed', 'throttle:20,1'])
            ->name('verification.verify');

        Route::middleware('auth:sanctum')->group(function () {
            Route::get('me', [AuthController::class, 'me']);
            Route::post('logout', [AuthController::class, 'logout']);
            Route::post('change-password', [AuthController::class, 'changePassword']);
        });
    });

    // ---------- Super Admin de WorkIn ----------
    Route::middleware(['auth:sanctum', 'role:super_admin'])->prefix('superadmin')->group(function () {
        Route::get('plans', [PlanController::class, 'index']);
        Route::get('companies', [CompanyController::class, 'index']);
        Route::post('companies', [CompanyController::class, 'store']);
        Route::get('companies/{company}', [CompanyController::class, 'show']);
        Route::patch('companies/{company}', [CompanyController::class, 'update']);
        Route::post('companies/{company}/suspend', [CompanyController::class, 'suspend']);
        Route::post('companies/{company}/reactivate', [CompanyController::class, 'reactivate']);
        Route::post('companies/{company}/owner/resend-invite', [CompanyController::class, 'resendOwnerInvite']);
    });

    // ---------- Empresa (dueño y administradores) ----------
    Route::middleware(['auth:sanctum', 'role:admin,company_owner', 'company.active'])->prefix('empresa')->group(function () {
        Route::get('/', [CompanyInfoController::class, 'show']);

        // Solo el dueño gestiona administradores
        Route::middleware('role:company_owner')->prefix('admins')->group(function () {
            Route::get('/', [AdminUserController::class, 'index']);
            Route::post('/', [AdminUserController::class, 'store']);
            Route::post('{id}/resend-invite', [AdminUserController::class, 'resendInvite'])->whereNumber('id');
            Route::patch('{id}/active', [AdminUserController::class, 'setActive'])->whereNumber('id');
        });

        // Tarifas
        Route::get('tarifas', [RateController::class, 'index']);
        Route::post('tarifas', [RateController::class, 'store']);
        Route::patch('tarifas/{id}', [RateController::class, 'update'])->whereNumber('id');

        // Lugares y pantalla del QR
        Route::get('lugares', [LocationController::class, 'index']);
        Route::post('lugares', [LocationController::class, 'store']);
        Route::patch('lugares/{id}', [LocationController::class, 'update'])->whereNumber('id');
        Route::delete('lugares/{id}', [LocationController::class, 'destroy'])->whereNumber('id');
        Route::post('lugares/{id}/pantalla', [LocationController::class, 'regenerateDisplay'])->whereNumber('id');

        // Bolsa de trabajadores
        Route::get('trabajadores', [WorkerPoolController::class, 'index']);
        Route::post('trabajadores/invitar', [WorkerPoolController::class, 'invite'])->middleware('throttle:30,1');
        Route::patch('trabajadores/{id}', [WorkerPoolController::class, 'update'])->whereNumber('id');
        Route::post('trabajadores/{id}/inhabilitar', [WorkerPoolController::class, 'disqualify'])->whereNumber('id');
        Route::post('trabajadores/{id}/habilitar', [WorkerPoolController::class, 'requalify'])->whereNumber('id');

        // Turnos
        Route::get('turnos', [ShiftController::class, 'index']);
        Route::post('turnos', [ShiftController::class, 'store']);
        Route::get('turnos/{id}', [ShiftController::class, 'show'])->whereNumber('id');
        Route::patch('turnos/{id}', [ShiftController::class, 'update'])->whereNumber('id');
        Route::post('turnos/{id}/publicar', [ShiftController::class, 'publish'])->whereNumber('id');
        Route::post('turnos/{id}/cancelar', [ShiftController::class, 'cancel'])->whereNumber('id');
        Route::get('turnos/{id}/postulaciones', [ApplicationController::class, 'index'])->whereNumber('id');
        Route::get('turnos/{id}/asistencia', [AttendanceController::class, 'byShift'])->whereNumber('id');

        // Postulaciones
        Route::post('postulaciones/{id}/aceptar', [ApplicationController::class, 'accept'])->whereNumber('id');
        Route::post('postulaciones/{id}/rechazar', [ApplicationController::class, 'reject'])->whereNumber('id');
        Route::post('postulaciones/{id}/retirar', [ApplicationController::class, 'cancel'])->whereNumber('id');
        Route::post('postulaciones/{id}/ausente', [ApplicationController::class, 'noShow'])->whereNumber('id');
        Route::post('postulaciones/{id}/asistencia', [AttendanceController::class, 'manual'])->whereNumber('id');

        // Horas extra
        Route::post('asistencias/{id}/horas-extra', [AttendanceController::class, 'addOvertime'])->whereNumber('id');
        Route::delete('horas-extra/{id}', [AttendanceController::class, 'removeOvertime'])->whereNumber('id');
        Route::get('horas-extra', [OvertimeRequestController::class, 'index']);
        Route::post('horas-extra/solicitudes/{id}/aprobar', [OvertimeRequestController::class, 'approve'])->whereNumber('id');
        Route::post('horas-extra/solicitudes/{id}/rechazar', [OvertimeRequestController::class, 'reject'])->whereNumber('id');

        // Cierre de períodos y resúmenes de pago
        Route::get('periodos', [PeriodController::class, 'index']);
        Route::get('periodos/pendiente', [PeriodController::class, 'pending']);
        Route::get('periodos/simular', [PeriodController::class, 'simulate']);
        Route::post('periodos/cerrar', [PeriodController::class, 'close']);
        Route::get('periodos/{id}', [PeriodController::class, 'show'])->whereNumber('id');
        Route::post('periodos/{id}/enviar', [PeriodController::class, 'send'])->whereNumber('id');
        Route::post('periodos/{id}/reabrir', [PeriodController::class, 'reopen'])->whereNumber('id');
        Route::get('periodos/{id}/detalle', [PeriodController::class, 'detail'])->whereNumber('id');
        Route::get('periodos/{id}/exportar', [PeriodController::class, 'export'])->whereNumber('id');
        Route::get('liquidaciones/{id}', [PeriodController::class, 'statement'])->whereNumber('id');
        Route::post('liquidaciones/{id}/responder', [PeriodController::class, 'reply'])->whereNumber('id');
    });

    // ---------- Trabajador ----------
    Route::middleware(['auth:sanctum', 'role:trabajador'])->prefix('trabajador')->group(function () {
        Route::get('invitaciones', [PoolController::class, 'invitations']);
        Route::post('invitaciones/{id}/aceptar', [PoolController::class, 'accept'])->whereNumber('id');
        Route::post('invitaciones/{id}/rechazar', [PoolController::class, 'decline'])->whereNumber('id');
        Route::get('empresas', [PoolController::class, 'companies']);
        Route::post('empresas/{id}/salir', [PoolController::class, 'leave'])->whereNumber('id');

        Route::get('ofertas', [OfferController::class, 'index']);
        Route::post('ofertas/{id}/postular', [OfferController::class, 'apply'])->whereNumber('id')->middleware('throttle:30,1');
        Route::delete('postulaciones/{id}', [OfferController::class, 'withdraw'])->whereNumber('id');

        Route::get('mis-turnos', [MyShiftsController::class, 'index']);
        Route::post('mis-turnos/{id}/horas-extra', [WorkerOvertimeController::class, 'store'])->whereNumber('id')->middleware('throttle:20,1');
        Route::delete('horas-extra/solicitudes/{id}', [WorkerOvertimeController::class, 'cancel'])->whereNumber('id');

        Route::get('pagos', [PaymentController::class, 'index']);
        Route::get('pagos/{id}', [PaymentController::class, 'show'])->whereNumber('id');
        Route::post('pagos/{id}/aceptar', [PaymentController::class, 'accept'])->whereNumber('id');
        Route::post('pagos/{id}/disputar', [PaymentController::class, 'dispute'])->whereNumber('id');
        Route::post('asistencia/escanear', [ScanController::class, 'scan'])->middleware('throttle:20,1');
    });
});
