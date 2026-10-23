import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Moon, Plus, Users } from 'lucide-react'
import { Button, EmptyState, Notice, PageHeader, Panel, Spinner, StatusDot, cx } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime, fmtMoney, fmtTime } from '../../lib/format'
import { ShiftModal, type Shift } from './ShiftModal'

export const SHIFT_STATUS: Record<Shift['status'], { tone: 'ok' | 'aviso' | 'idle' | 'error'; text: string }> = {
  draft: { tone: 'aviso', text: 'Borrador' },
  published: { tone: 'ok', text: 'Publicado' },
  cancelled: { tone: 'idle', text: 'Cancelado' },
  closed: { tone: 'idle', text: 'Cerrado' },
}

const FILTERS: Array<{ value: '' | Shift['status']; label: string }> = [
  { value: '', label: 'Todos' }, { value: 'published', label: 'Publicados' }, { value: 'draft', label: 'Borradores' },
  { value: 'cancelled', label: 'Cancelados' }, { value: 'closed', label: 'Cerrados' },
]

interface Resp { data: Shift[]; usage: { used: number; limit: number | null; over_limit: boolean } }

export default function Turnos() {
  const nav = useNavigate()
  const [filter, setFilter] = useState<'' | Shift['status']>('')
  const [creating, setCreating] = useState(false)
  const q = useQuery({ queryKey: ['empresa', 'turnos', filter], queryFn: () => api<Resp>('/empresa/turnos', { query: { status: filter || undefined } }) })
  const rows = q.data?.data ?? []
  const usage = q.data?.usage

  return (
    <>
      <PageHeader
        title="Turnos"
        subtitle="Publica turnos y decide quién trabaja. Se muestran los de los últimos 7 días en adelante."
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Nuevo turno</Button>}
      />

      {usage && usage.limit !== null && (
        <Notice tone={usage.over_limit ? 'aviso' : 'info'} className="mb-5">
          Este mes publicaste {usage.used} de {usage.limit} turnos de tu plan.{usage.over_limit ? ' Superaste el límite; puedes seguir publicando, pero conviene revisar tu plan con WorkIn.' : ''}
        </Notice>
      )}

      <div role="tablist" aria-label="Estado del turno" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.value} role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
            className={cx('rounded-control px-3.5 py-2 text-sm font-medium transition-colors', filter === f.value ? 'bg-tinta text-crema' : 'text-tinta-2 hover:bg-arena')}>
            {f.label}
          </button>
        ))}
      </div>

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar los turnos.'}</Notice></div>
        ) : rows.length === 0 ? (
          <EmptyState title="No hay turnos" action={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Crear un turno</Button>}>
            Publica el primero y tu bolsa recibirá un aviso por correo.
          </EmptyState>
        ) : (
          <ul>
            {rows.map((s) => (
              <li key={s.id} className="border-b border-linea last:border-b-0">
                <Link to={`/empresa/turnos/${s.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-arena/60">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{s.title} {s.is_night && <Moon className="ml-1 inline size-3.5 text-tinta-3" aria-label="Turno de noche" />}</p>
                    <p className="text-sm text-tinta-3">{s.location.name} · {fmtDateTime(s.starts_at)} a {fmtTime(s.ends_at)} · {fmtMoney(s.rate?.shift_amount)}</p>
                  </div>
                  <div className="flex w-40 items-center gap-1.5 text-sm text-tinta-2">
                    <Users className="size-4 text-tinta-3" aria-hidden />
                    {s.accepted_count ?? 0} de {s.slots}
                    {(s.applied_count ?? 0) > 0 && <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-medium text-naranja-oscuro">{s.applied_count} por decidir</span>}
                  </div>
                  <div className="w-28 text-sm"><StatusDot tone={SHIFT_STATUS[s.status].tone}>{SHIFT_STATUS[s.status].text}</StatusDot></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ShiftModal target={creating ? 'new' : null} onClose={() => setCreating(false)} onSaved={(s) => nav(`/empresa/turnos/${s.id}`)} />
    </>
  )
}
