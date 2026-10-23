import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, Download } from 'lucide-react'
import { Button, EmptyState, Notice, PageHeader, Panel, SelectField, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { downloadPaymentsXlsx, type ExcelWorker } from '../../lib/excel'
import { addDays, fmtMoney, todayLocal } from '../../lib/format'
import { fmtPeriod, LinesList, summarize, type Line } from '../../lib/pagos'

type SimLine = Line & { user_id: number; rut: string; worker: string; location_id: number; closed: boolean }
interface Resp {
  from: string; to: string
  options: { workers: { id: number; name: string }[]; locations: { id: number; name: string }[]; rates: string[] }
  lines: SimLine[]
}
type GroupBy = 'worker' | 'location' | 'rate'
const GROUP_LABEL: Record<GroupBy, string> = { worker: 'Trabajador', location: 'Lugar', rate: 'Tarifa' }

/** Simulación de un cierre con fechas y filtros a elección. No crea períodos ni cambia nada. */
export default function PagoSimulacion() {
  const toast = useToast()
  const today = todayLocal()
  const [from, setFrom] = useState(addDays(today, -14))
  const [to, setTo] = useState(today)
  const [userId, setUserId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [rate, setRate] = useState('')
  const [status, setStatus] = useState('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('worker')
  const [open, setOpen] = useState<string | null>(null)
  const [res, setRes] = useState<Resp | null>(null)

  // Las opciones salen del último rango consultado (sin aplicar los filtros de trabajador, lugar o tarifa).
  const [opts, setOpts] = useState<Resp['options'] | null>(null)

  const run = useMutation({
    mutationFn: (override?: { clear?: boolean }) => {
      const p = new URLSearchParams({ from, to, status })
      if (!override?.clear) {
        if (userId) p.set('user_id', userId)
        if (locationId) p.set('location_id', locationId)
        if (rate) p.set('rate', rate)
      }
      return api<Resp>(`/empresa/periodos/simular?${p}`)
    },
    onSuccess: (r) => { setRes(r); setOpen(null); setOpts(r.options) },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos calcular la simulación.'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    run.mutate({})
  }
  const reset = () => { setUserId(''); setLocationId(''); setRate(''); run.mutate({ clear: true }) }

  const groups = useMemo(() => {
    if (!res) return []
    const m = new Map<string, { key: string; label: string; sub: string; lines: SimLine[] }>()
    for (const l of res.lines) {
      const [key, label, sub] = groupBy === 'worker' ? [`w${l.user_id}`, l.worker, l.rut]
        : groupBy === 'location' ? [`l${l.location_id}`, l.location, 'Lugar']
        : [`r${l.rate_name ?? ''}`, l.rate_name ?? 'Sin tarifa', 'Tarifa']
      const g = m.get(key) ?? { key, label, sub, lines: [] }
      g.lines.push(l); m.set(key, g)
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [res, groupBy])

  const total = res?.lines.reduce((a, l) => a + l.total, 0) ?? 0
  const otHours = Math.round((res?.lines.reduce((a, l) => a + l.overtime_hours, 0) ?? 0) * 100) / 100
  const workers = res ? new Set(res.lines.map((l) => l.user_id)).size : 0
  const options = opts ?? res?.options

  const xlsx = useMutation({
    mutationFn: async () => {
      const by = new Map<number, ExcelWorker>()
      for (const l of res!.lines) {
        const w = by.get(l.user_id) ?? { rut: l.rut, name: l.worker, lines: [] }
        w.lines.push(l); by.set(l.user_id, w)
      }
      await downloadPaymentsXlsx({
        title: `Simulación ${fmtPeriod(res!.from, res!.to)}`,
        fileName: `simulacion_${res!.from}_${res!.to}.xlsx`,
        workers: [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
      })
    },
    onError: () => toast.error('No pudimos generar el Excel.'),
  })

  return (
    <>
      <Link to="/empresa/pagos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-3 hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> Pagos</Link>
      <PageHeader title="Simular un cierre" subtitle="Elige fechas y filtros para ver cuánto se pagaría. Es solo una simulación: no cierra ningún período, no envía nada y no cambia las asistencias." />

      <Panel className="mb-6 p-5">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Desde" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          <TextField label="Hasta" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          <SelectField label="Asistencias" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas</option>
            <option value="open">Solo las sin cerrar</option>
            <option value="closed">Solo las ya cerradas</option>
          </SelectField>
          <SelectField label="Agrupar por" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
          </SelectField>
          <SelectField label="Trabajador" value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!options}>
            <option value="">Todos</option>
            {options?.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </SelectField>
          <SelectField label="Lugar" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!options}>
            <option value="">Todos</option>
            {options?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
          <SelectField label="Tarifa" value={rate} onChange={(e) => setRate(e.target.value)} disabled={!options}>
            <option value="">Todas</option>
            {options?.rates.map((r) => <option key={r} value={r}>{r}</option>)}
          </SelectField>
          <div className="flex items-end gap-2">
            <Button type="submit" loading={run.isPending}>Simular</Button>
            {(userId || locationId || rate) && <Button type="button" variant="ghost" onClick={reset}>Quitar filtros</Button>}
          </div>
        </form>
        {!options && <p className="mt-3 text-sm text-tinta-3">Primero simula el rango; después podrás filtrar por trabajador, lugar o tarifa.</p>}
      </Panel>

      {res && (
        <>
          <Notice tone="info" className="mb-5">Simulación del {fmtPeriod(res.from, res.to)}. Los montos son brutos y no quedan guardados en ninguna parte.</Notice>
          {res.lines.length === 0 ? (
            <Panel><EmptyState title="No hay asistencias con esos datos">Prueba con otro rango de fechas o quita algún filtro. Solo cuentan asistencias con entrada y salida.</EmptyState></Panel>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-tinta-2">
                  {res.lines.length} {res.lines.length === 1 ? 'turno' : 'turnos'} · {workers} {workers === 1 ? 'trabajador' : 'trabajadores'}{otHours > 0 ? ` · ${String(otHours).replace('.', ',')} h extra` : ''} · <strong className="text-tinta">Total bruto {fmtMoney(total)}</strong>
                </p>
                <Button variant="secondary" loading={xlsx.isPending} onClick={() => xlsx.mutate()}><Download className="size-4" aria-hidden /> Descargar Excel</Button>
              </div>
              <Panel className="overflow-hidden">
                <ul>
                  {groups.map((g) => {
                    const isOpen = open === g.key
                    const sum = g.lines.reduce((a, l) => a + l.total, 0)
                    return (
                      <li key={g.key} className="border-b border-linea last:border-b-0">
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}
                          className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-arena/60">
                          <div className="min-w-52 flex-1">
                            <p className="font-medium">{g.label}</p>
                            <p className="text-sm text-tinta-3">{g.sub} · {summarize(g.lines)}</p>
                          </div>
                          <p className="w-28 text-right font-medium">{fmtMoney(sum)}</p>
                          <ChevronDown className={`size-4 text-tinta-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                        {isOpen && <div className="border-t border-linea bg-crema px-5 py-4">
                          {groupBy !== 'worker' && <p className="mb-3 text-xs text-tinta-3">Cada turno se muestra con el nombre del trabajador en el título.</p>}
                          <LinesList showAlerts lines={g.lines.map((l) => ({ ...l, title: groupBy === 'worker' ? l.title : `${l.worker} · ${l.title}`, late_unauthorized_minutes: l.closed ? 0 : l.late_unauthorized_minutes, has_pending_request: l.closed ? false : l.has_pending_request }))} />
                        </div>}
                      </li>
                    )
                  })}
                </ul>
              </Panel>
            </>
          )}
        </>
      )}
    </>
  )
}
