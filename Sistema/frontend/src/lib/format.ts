const TZ = 'America/Santiago'

/** "2026-11-03T11:00:00Z" → "mar 3 nov, 08:00" en hora de Santiago. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ,
  }).format(new Date(iso)).replace('.', '')
}

/** "2027-01-14" (fecha sin hora) → "14 ene 2027". */
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d))).replace(/\./g, '')
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

/** Fecha de hoy en Santiago como "YYYY-MM-DD" (para mínimos de inputs de fecha). */
export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Equipo WorkIn',
  company_owner: 'Dueño de la empresa',
  admin: 'Administrador',
  trabajador: 'Trabajador',
}

/** "2026-11-03T11:00:00Z" → "2026-11-03T08:00" (hora de Santiago, para <input type="datetime-local">). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** "2026-11-03T08:00" → "mar 3 nov, 08:00" sin convertir zona (ya es hora local). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(iso))
}
