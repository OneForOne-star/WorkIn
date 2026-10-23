# WorkIn

**Plataforma para gestionar trabajadores por turno (día a día) en varias empresas a la vez.**
Las empresas publican turnos, los trabajadores postulan, la asistencia se marca con un QR que rota, y al cierre de cada período el sistema calcula el pago de cada persona y le muestra, turno por turno, por qué se le paga ese monto.

> Proyecto de título (capstone) de Daniel Plasencia y Cristopher Aguilera. Estado: en uso con datos de prueba, en preparación para primeras empresas reales.

---

## Qué hace

**Para la empresa (dueño o administrador)**
- Crea lugares, tarifas y turnos; los publica a su bolsa de trabajadores (invitación por RUT) con prioridades alta, media y baja.
- Acepta o rechaza postulaciones, marca ausencias y corrige asistencias a mano con motivo auditado.
- Autoriza horas extra, o responde las solicitudes que hacen los trabajadores. Recibe alertas de salidas tardías sin horas extra autorizadas.
- Cierra períodos de pago (quincenal o mensual), ve el detalle por trabajador **antes y después** de cerrar, y envía los resúmenes por correo.
- Descarga un **Excel con fórmulas** (hojas Resumen, Detalle y Parámetros con "Valor turno" y "Valor hora extra").
- **Simula cierres** con fechas y filtros libres (trabajador, lugar, tarifa, estado), sin guardar nada.
- Responde los reclamos de los trabajadores y puede reabrir un período si nadie lo ha aceptado.

**Para el trabajador**
- Ve ofertas de las empresas a las que pertenece, postula y administra sus turnos.
- Marca entrada y salida escaneando el QR del lugar (ventana de ±30 minutos).
- Pide horas extra por un turno ya trabajado.
- Revisa su resumen de pago con el detalle de cada turno y lo **acepta o lo reclama** con un comentario.

**Para el equipo WorkIn (super administrador)**
- Crea y suspende empresas, asigna planes y reenvía invitaciones.

## Reglas de negocio importantes

- Roles: `super_admin`, `company_owner`, `admin`, `trabajador`. Inicio de sesión con correo o RUT.
- Un trabajador puede estar en varias empresas, pero **no puede tener dos turnos aceptados que se traslapen**, aunque sean de empresas distintas (lo garantiza la base de datos).
- **Cada turno guarda su tarifa al publicarse** (valor del turno y de la hora extra). Cambiar la tarifa después no altera turnos ya publicados ni pagos pasados.
- El QR de cada lugar rota cada 5 minutos. Las marcas válidas van de 30 minutos antes a 30 minutos después del horario.
- **Solo se pagan las horas extra autorizadas** por la empresa, en tramos de 15 minutos, con un máximo de 12 por turno.
- Los montos son **brutos**. El pago de un turno es el valor fijo del turno más horas extra × valor de la hora extra.
- Un turno cuenta en el período de su fecha de inicio (hora de Santiago). Las asistencias sin salida no se pagan hasta completarse.
- Al cerrar un período las asistencias quedan fijas. No se puede cerrar con solicitudes de horas extra sin responder.
- Los registros de auditoría son inmutables (triggers de base de datos).

## Arquitectura

```
Navegador (React + Vite)  ──HTTPS──▶  API Laravel 13 (Sanctum)  ──▶  MariaDB 10.11
workin.otecnya.cl                      api-workin.otecnya.cl           reglas críticas en triggers
        ▲                                        │
        └──────── enlaces en correos ◀───────────┴── Correo SMTP (Brevo) y tareas programadas (cron)
```

| Capa | Tecnología |
|---|---|
| Web | React + TypeScript, Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS v4, ExcelJS (Excel en el navegador), jsQR/qrcode.react |
| API | Laravel 13, Laravel Sanctum (tokens), PHP 8.3 |
| Base de datos | MariaDB 10.11 (triggers, procedimientos y restricciones CHECK) |
| Hosting | cPanel compartido: sin Node en el servidor, la web se compila en local y se sube estática |
| Correo | SMTP de Brevo, dominio autenticado (DKIM, DMARC) |

## Estructura del repositorio

```
backend/     Código propio de la API Laravel (app, routes, config, lang, vistas de correo)
frontend/    Aplicación web React (src, public, configuración de Vite)
database/    Esquema completo (schema/) y parches incrementales (patches/)
deploy/      Scripts de despliegue y verificación para Windows + cPanel por SSH
docs/        Notas de diseño y planes
```

> **Importante sobre `backend/`:** contiene el código propio de WorkIn, no el esqueleto completo de Laravel (`composer.json`, `vendor/`, `artisan`, etc.). Para levantarlo localmente hay que crear un proyecto Laravel 13 y copiar encima el contenido de `backend/`. Pendiente: incorporar el proyecto completo al repositorio.

## Puesta en marcha local

### Web
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # revisa tipos y genera dist/
```
La URL de la API se define con `VITE_API_URL` (copia `frontend/.env.example` a `.env.development` y `.env.production`).

### API
1. Crear un proyecto Laravel 13 y ejecutar `php artisan install:api` (Sanctum).
2. Copiar `backend/` encima del proyecto (sobrescribe `bootstrap/app.php` y `AppServiceProvider`).
3. Crear la base de datos y cargar `database/schema/workin_schema_v2.sql`, luego los parches de `database/patches/` que correspondan, en orden.
4. Configurar el `.env` (abajo) y ejecutar `php artisan serve`.
5. Crear el primer super administrador con `php artisan workin:create-super-admin`. Para verificar un correo a mano: `php artisan workin:verify-email correo@ejemplo.cl`.

### Variables de entorno (API)

| Variable | Para qué |
|---|---|
| `DB_*` | Conexión a MariaDB |
| `FRONTEND_URL` | Base de los enlaces de los correos |
| `MAIL_*` | SMTP (Brevo): host, puerto 587, usuario, clave y remitente |
| `WORKIN_GRACE_DAYS` | Días de gracia antes de suspender una empresa vencida (14) |
| `WORKIN_WORKER_CANCEL_HOURS` | Horas mínimas para que un trabajador deje un turno aceptado (24) |
| `QUEUE_CONNECTION` | Hoy `sync`: los correos se envían en la misma petición |

El archivo `.env` **nunca** se sube al repositorio.

## Base de datos

- `database/schema/workin_schema_v2.sql` es el esquema completo vigente.
- `database/patches/` son los cambios incrementales (`01` a `07`): autenticación, bloque de turnos, migración v1→v2, tarifa fija en el turno, resúmenes de pago y solicitudes de horas extra. Están pensados para correr una sola vez, en orden.
- Triggers y procedimientos aplican las reglas críticas (traslape de turnos, cupos) y protegen la auditoría. Los controladores traducen esos errores a mensajes claros.
- `database/limpiar_datos_prueba.sql` elimina los datos de prueba (los usuarios que ya tienen auditoría se desactivan, porque la auditoría no se puede borrar).

## Tareas programadas

Un único cron cada minuto ejecuta `php artisan schedule:run`, que dispara:

| Comando | Cuándo | Qué hace |
|---|---|---|
| `workin:suspend-expired` | Diario | Suspende empresas con suscripción vencida más allá de la gracia |
| `workin:notify-low-priority` | Cada 5 min | Avisa a los de prioridad baja cuando se abre una oferta para ellos |
| `workin:archive` | Diario | Archiva registros de más de 2 años |

## Despliegue (cPanel por SSH, desde Windows)

La web se compila en local y el servidor no necesita Node.

1. Compilar: `cd frontend && npm run build`, y comprimir `dist/` como `web.zip` (incluye `.htaccess`).
2. Comprimir `app` y `routes` del backend (y lo que haya cambiado) como `backend.zip`.
3. Dejar `backend.zip`, `web.zip` y los `.sql` nuevos en una carpeta `entrega/`.
4. Ejecutar `desplegar.cmd`. Muestra el plan, pide confirmación y en el servidor:
   - respalda base, código y web en `~/backups`;
   - aplica cada `.sql` una sola vez (registro en `~/backups/sql-aplicados.txt`);
   - revisa la sintaxis PHP, copia los archivos y limpia la caché de Laravel;
   - archiva lo entregado.
5. Ejecutar `verificar2.cmd` para una revisión de solo lectura (archivos, rutas, base y API).

Configuración de los scripts: definir la variable de entorno `WORKIN_SERVIDOR` (por ejemplo `usuario@servidor`) y tener la llave SSH en `~/.ssh/workin_deploy`. `configurar_correo.cmd` configura el SMTP pidiendo la clave sin guardarla en ningún archivo.

Para revertir, los respaldos de cada despliegue quedan en `~/backups`.

## API (resumen)

Prefijo `/api/v1`. Autenticación con token Bearer (Sanctum).

| Área | Rutas principales |
|---|---|
| Acceso | `auth/register`, `auth/login`, `auth/forgot-password`, `auth/invitation/accept`, `auth/me` |
| Equipo WorkIn | `superadmin/companies`, `superadmin/plans` |
| Empresa | `empresa/turnos`, `postulaciones`, `lugares`, `tarifas`, `trabajadores`, `admins` |
| Asistencia y horas extra | `empresa/turnos/{id}/asistencia`, `asistencias/{id}/horas-extra`, `horas-extra` (solicitudes) |
| Pagos | `empresa/periodos` (pendiente, simular, cerrar, enviar, reabrir, detalle), `liquidaciones/{id}/responder` |
| Trabajador | `trabajador/ofertas`, `mis-turnos`, `asistencia/escanear`, `pagos`, `mis-turnos/{id}/horas-extra` |
| Público | `pantalla/{token}` (pantalla del QR, el enlace secreto es la credencial) |

## Seguridad

- Contraseñas con hash, tokens Sanctum, límites de intentos (throttle) en acceso, postulación y marcación.
- Cada empresa solo accede a sus datos; los controladores filtran siempre por la empresa del usuario.
- Los correos a cuentas `@prueba.workin.cl` se bloquean para no enviar correo real durante las pruebas.
- Auditoría inmutable de cierres, envíos, reclamos, respuestas y horas extra.
- Nunca se suben al repositorio: `.env`, llaves SSH, claves SMTP ni respaldos.

## Datos de prueba

Los datos de prueba llevan el prefijo `[PRUEBA]` y correos `@prueba.workin.cl`, y se pueden eliminar con `database/limpiar_datos_prueba.sql`.

## Pendientes y próximas ideas

- Marcar el resumen como **pagado** (fecha y comprobante) y generar el archivo de transferencias masivas.
- Bonos y descuentos por trabajador dentro de un período.
- Aviso por correo a la empresa cuando un trabajador reclama; corrección puntual de un resumen sin reabrir todo el período.
- Datos bancarios del trabajador cifrados.
- Copias de seguridad diarias automáticas de la base de datos.
- Términos, privacidad y cumplimiento de la ley de datos personales (a revisar con un abogado).
- Importación y conciliación de boletas de honorarios (ver `docs/plan_boletas_honorarios.md`).
- Recargos automáticos por noche y feriado (a revisar con un abogado), alertas por WhatsApp o push y marca propia por empresa.
- Ambiente de pruebas separado y pruebas automatizadas.

## Equipo

Daniel Plasencia y Cristopher Aguilera.

## Licencia

Por definir. Mientras tanto, todos los derechos reservados.
