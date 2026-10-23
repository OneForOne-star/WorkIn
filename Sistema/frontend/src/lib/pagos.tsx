import { AlertTriangle, Moon, PenLine, Sparkles } from 'lucide-react'
import { fmtDate, fmtMoney, fmtTime } from './format'
import { StatusDot } from '../components/ui'

export type StatementStatus = 'pending' | 'sent' | 'accepted' | 'disputed'

export interface OvertimeEntry { hours: number; comment: string | null; authorized_by: string | null }

export interface Line {
  date: string
  title: string
  location: string
  rate_name: string | null
  is_night: boolean
  is_holiday: boolean
  scheduled_start: string | null
  scheduled_end: string | null
  check_in_at: string | null
  check_out_at: string | null
  worked_minutes: number | null
  manual: boolean
  manual_by: string | null
  comment: string | null
  shift_amount: number
  overtime_rate: number
  overtime: OvertimeEntry[]
  overtime_hours: number
  overtime_amount: number
  total: number
  late_unauthorized_minutes?: number
  has_pending_request?: boolean
}

export const fmtPeriod = (start: string, end: string) => `${fmtDate(start)} al ${fmtDate(end)}`

const fmtHours = (h: number) => `${String(h).replace('.', ',')} h`

function fmtWorked(min: number | null) {
  if (min === null) return null
  const h = Math.floor(min / 60), m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function StatementStatusDot({ status }: { status: StatementStatus }) {
  switch (status) {
    case 'pending': return <StatusDot tone="idle">Sin enviar</StatusDot>
    case 'sent': return <StatusDot tone="info">Esperando respuesta</StatusDot>
    case 'accepted': return <StatusDot tone="ok">Aceptado</StatusDot>
    case 'disputed': return <StatusDot tone="aviso">En reclamo</StatusDot>
  }
}

/** Cómo se llega al monto de un trabajador: una frase con la suma. */
export function summarize(lines: Line[]): string {
  const shifts = lines.length
  const shiftsTotal = lines.reduce((s, l) => s + l.shift_amount, 0)
  const ot = lines.reduce((s, l) => s + l.overtime_amount, 0)
  const otH = lines.reduce((s, l) => s + l.overtime_hours, 0)
  const total = shiftsTotal + ot
  const base = `${shifts} ${shifts === 1 ? 'turno' : 'turnos'} ${fmtMoney(shiftsTotal)}`
  return ot > 0 ? `${base} + ${fmtHours(Math.round(otH * 100) / 100)} extra ${fmtMoney(ot)} = ${fmtMoney(total)}` : `${base} = ${fmtMoney(total)}`
}

/** Una tarjeta por turno: qué se trabajó, qué se marcó y cómo se calculó el pago. */
export function LinesList({ lines, showAlerts = false }: { lines: Line[]; showAlerts?: boolean }) {
  if (lines.length === 0) return <p className="text-sm text-tinta-3">No hay turnos en este resumen.</p>
  const total = lines.reduce((s, l) => s + l.total, 0)
  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <article key={i} className="rounded-control border border-linea bg-papel">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-linea px-4 py-3">
            <div className="min-w-44">
              <p className="font-medium">{l.title}</p>
              <p className="text-sm text-tinta-3">{fmtDate(l.date)} · {l.location}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {l.rate_name && <span className="rounded-full bg-arena px-2.5 py-1 text-tinta-2">Tarifa: {l.rate_name}</span>}
              {l.is_night && <span className="inline-flex items-center gap-1 rounded-full bg-arena px-2.5 py-1 text-tinta-2"><Moon className="size-3" aria-hidden /> Nocturno</span>}
              {l.is_holiday && <span className="inline-flex items-center gap-1 rounded-full bg-arena px-2.5 py-1 text-tinta-2"><Sparkles className="size-3" aria-hidden /> Feriado</span>}
            </div>
          </header>

          <dl className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-tinta-3">Horario del turno</dt>
              <dd>{fmtTime(l.scheduled_start)} a {fmtTime(l.scheduled_end)}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-tinta-3">Lo que marcó</dt>
              <dd>
                {fmtTime(l.check_in_at)} a {fmtTime(l.check_out_at)}
                {fmtWorked(l.worked_minutes) && <span className="text-tinta-3"> · {fmtWorked(l.worked_minutes)}</span>}
              </dd>
            </div>
          </dl>

          {l.manual && (
            <p className="mx-4 mb-3 flex items-start gap-2 rounded-control bg-aviso-suave px-3 py-2 text-sm text-aviso">
              <PenLine className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Registro manual{l.manual_by ? ` por ${l.manual_by}` : ''}{l.comment ? `: ${l.comment}` : ''}</span>
            </p>
          )}

          {showAlerts && (l.late_unauthorized_minutes ?? 0) > 0 && (
            <p className="mx-4 mb-3 flex items-start gap-2 rounded-control bg-aviso-suave px-3 py-2 text-sm text-aviso">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Salió {fmtWorked(l.late_unauthorized_minutes!)} después del término del turno y no hay horas extra autorizadas por ese tiempo. No se paga a menos que lo autorices.</span>
            </p>
          )}
          {showAlerts && l.has_pending_request && (
            <p className="mx-4 mb-3 rounded-control bg-arena px-3 py-2 text-sm text-tinta-2">Hay una solicitud de horas extra sin responder para este turno.</p>
          )}

          <div className="border-t border-linea px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <span>Pago por turno</span>
              <span>{fmtMoney(l.shift_amount)}</span>
            </div>
            {l.overtime.length > 0 && (
              <div className="mt-2">
                <div className="flex justify-between gap-4">
                  <span>Horas extra: {fmtHours(l.overtime_hours)} × {fmtMoney(l.overtime_rate)}</span>
                  <span>{fmtMoney(l.overtime_amount)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-tinta-3">
                  {l.overtime.map((o, j) => (
                    <li key={j}>
                      {fmtHours(o.hours)}{o.authorized_by ? `, autorizadas por ${o.authorized_by}` : ''}{o.comment ? `: ${o.comment}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-2 flex justify-between gap-4 border-t border-linea pt-2 font-medium">
              <span>Total del turno</span>
              <span>{fmtMoney(l.total)}</span>
            </div>
          </div>
        </article>
      ))}
      <div className="rounded-control bg-arena px-4 py-3 text-sm">
        <p className="text-tinta-3">{summarize(lines)}</p>
        <p className="mt-1 flex justify-between gap-4 text-base font-semibold"><span>Total bruto</span><span>{fmtMoney(total)}</span></p>
      </div>
    </div>
  )
}
