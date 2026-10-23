import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, Pause, Play, Plus, Search, ShieldCheck } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextAreaField, TextField, cx } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { fmtDateTime } from '../../lib/format'
import { formatPhone, isValidRut, normalizeRut } from '../../lib/rut'

type Status = 'invited' | 'active' | 'declined' | 'inactive' | 'left'
type Priority = 'alta' | 'media' | 'baja'

interface Worker {
  id: number; user_id: number; status: Status; priority: Priority; rut: string | null
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null
  invited_at: string | null; responded_at: string | null; disqualified: boolean
}
interface Resp { data: Worker[]; meta: { current_page: number; last_page: number; total: number; counts: Partial<Record<Status, number>> } }

const TABS: Array<{ value: '' | Status; label: string }> = [
  { value: 'active', label: 'En la bolsa' },
  { value: 'invited', label: 'Invitados' },
  { value: 'inactive', label: 'Pausados' },
  { value: 'declined', label: 'Rechazaron' },
  { value: 'left', label: 'Salieron' },
]
const STATUS_TEXT: Record<Status, { tone: 'ok' | 'aviso' | 'idle'; text: string }> = {
  active: { tone: 'ok', text: 'Activo' },
  invited: { tone: 'aviso', text: 'Invitación pendiente' },
  inactive: { tone: 'idle', text: 'Pausado' },
  declined: { tone: 'idle', text: 'Rechazó la invitación' },
  left: { tone: 'idle', text: 'Salió de la bolsa' },
}
const KEY = ['empresa', 'trabajadores']

export default function Trabajadores() {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<Status>('active')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [inviting, setInviting] = useState(false)
  const [toBlock, setToBlock] = useState<Worker | null>(null)

  const q = useQuery({
    queryKey: [...KEY, status, search, page],
    queryFn: () => api<Resp>('/empresa/trabajadores', { query: { status, q: search || undefined, page } }),
    placeholderData: (prev) => prev,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const onErr = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No pudimos guardar el cambio.')

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; priority?: Priority; status?: 'active' | 'inactive' }) => api(`/empresa/trabajadores/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh, onError: onErr,
  })
  const unblock = useMutation({
    mutationFn: (id: number) => api(`/empresa/trabajadores/${id}/habilitar`, { method: 'POST' }),
    onSuccess: async () => { await refresh(); toast.ok('Habilitado nuevamente.') }, onError: onErr,
  })

  const rows = q.data?.data ?? []
  const counts = q.data?.meta.counts ?? {}
  const last = q.data?.meta.last_page ?? 1

  return (
    <>
      <PageHeader
        title="Trabajadores"
        subtitle="Tu bolsa: las personas que pueden ver tus ofertas. Primero deben registrarse en WorkIn; tú las invitas con su RUT y ellas aceptan."
        actions={<Button onClick={() => setInviting(true)}><Plus className="size-4" aria-hidden /> Invitar por RUT</Button>}
      />

      <div role="tablist" aria-label="Estado en la bolsa" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={status === t.value} onClick={() => { setStatus(t.value as Status); setPage(1) }}
            className={cx('rounded-control px-3.5 py-2 text-sm font-medium transition-colors',
              status === t.value ? 'bg-tinta text-crema' : 'text-tinta-2 hover:bg-arena')}>
            {t.label}{counts[t.value as Status] !== undefined && <span className={cx('ml-1.5', status === t.value ? 'text-crema/70' : 'text-tinta-3')}>{counts[t.value as Status]}</span>}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-3" aria-hidden />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar por nombre, RUT o correo" aria-label="Buscar trabajadores"
          className="h-11 w-full rounded-control border border-linea bg-papel pl-10 pr-3 text-[0.95rem] focus:border-naranja-fuerte focus:outline-none focus:ring-2 focus:ring-naranja/25" />
      </div>

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar a los trabajadores.'}</Notice></div>
        ) : rows.length === 0 ? (
          <EmptyState title={search ? 'Sin resultados' : 'No hay nadie aquí todavía'}
            action={status === 'active' && !search ? <Button onClick={() => setInviting(true)}><Plus className="size-4" aria-hidden /> Invitar por RUT</Button> : undefined}>
            {search ? 'Prueba con otro nombre o RUT.' : 'Cuando alguien acepte tu invitación aparecerá en esta lista.'}
          </EmptyState>
        ) : (
          <ul>
            {rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{w.first_name} {w.last_name}</p>
                  <p className="text-sm text-tinta-3">{w.rut}{w.email ? ` · ${w.email}` : ''}{w.phone ? ` · ${formatPhone(w.phone)}` : ''}</p>
                </div>
                <div className="w-52 text-sm">
                  <StatusDot tone={STATUS_TEXT[w.status].tone}>{STATUS_TEXT[w.status].text}</StatusDot>
                  {w.status === 'invited' && <p className="mt-0.5 pl-4 text-tinta-3">Enviada {fmtDateTime(w.invited_at)}</p>}
                  {w.disqualified && <p className="mt-0.5 pl-4 font-medium text-error">Inhabilitado</p>}
                </div>
                {(w.status === 'active' || w.status === 'inactive') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`prio-${w.id}`}>Prioridad de {w.first_name}</label>
                    <select id={`prio-${w.id}`} value={w.priority} onChange={(e) => update.mutate({ id: w.id, priority: e.target.value as Priority })}
                      className="h-9 rounded-control border border-linea bg-papel px-2.5 text-sm">
                      <option value="alta">Prioridad alta</option>
                      <option value="media">Prioridad media</option>
                      <option value="baja">Prioridad baja</option>
                    </select>
                    {w.status === 'active'
                      ? <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: w.id, status: 'inactive' })}><Pause className="size-4" aria-hidden /> Pausar</Button>
                      : <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: w.id, status: 'active' })}><Play className="size-4" aria-hidden /> Reactivar</Button>}
                    {w.disqualified
                      ? <Button size="sm" variant="secondary" loading={unblock.isPending && unblock.variables === w.id} onClick={() => unblock.mutate(w.id)}><ShieldCheck className="size-4" aria-hidden /> Habilitar</Button>
                      : <Button size="sm" variant="ghost" onClick={() => setToBlock(w)}><Ban className="size-4" aria-hidden /> Inhabilitar</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {last > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-tinta-3">Página {page} de {last}</span>
          <Button size="sm" variant="secondary" disabled={page >= last} onClick={() => setPage(page + 1)}>Siguiente</Button>
        </div>
      )}

      <Notice className="mt-6">La prioridad define cuándo ve cada persona tus ofertas: las de prioridad baja las ven un poco después que el resto.</Notice>

      <InviteModal open={inviting} onClose={() => setInviting(false)} onDone={() => { setStatus('invited'); setPage(1) }} />
      <BlockModal worker={toBlock} onClose={() => setToBlock(null)} />
    </>
  )
}

const inviteSchema = z.object({ rut: z.string().refine(isValidRut, 'El RUT no es válido. Revisa el número y el dígito verificador.') })

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema) })

  async function onSubmit(v: z.infer<typeof inviteSchema>) {
    setFormError(null)
    try {
      const r = await api<{ message: string; email_sent: boolean; worker: { first_name: string; last_name: string } }>('/empresa/trabajadores/invitar', { method: 'POST', body: { rut: normalizeRut(v.rut) } })
      await qc.invalidateQueries({ queryKey: KEY })
      toast.ok(`${r.worker.first_name} ${r.worker.last_name}: ${r.message}`)
      reset(); onClose(); onDone()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invitar por RUT"
      description="La persona debe estar registrada en WorkIn. Si no la encontramos, pídele que cree su cuenta primero."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-invitar" loading={isSubmitting}>Enviar invitación</Button></>}>
      <form id="form-invitar" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="RUT" placeholder="12.345.678-5" autoFocus error={errors.rut?.message} {...register('rut')} />
        <p className="text-sm text-tinta-3">Por seguridad, cada administrador tiene un máximo de 5 búsquedas sin resultado cada 24 horas.</p>
      </form>
    </Modal>
  )
}

const blockSchema = z.object({
  reason: z.string().trim().min(3, 'Escribe el motivo (al menos 3 letras).').max(80, 'Máximo 80 caracteres.'),
  detail: z.string().trim().max(500),
  ends_at: z.string(),
})

function BlockModal({ worker, onClose }: { worker: Worker | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof blockSchema>>({
    resolver: zodResolver(blockSchema), values: { reason: '', detail: '', ends_at: '' },
  })

  async function onSubmit(v: z.infer<typeof blockSchema>) {
    if (!worker) return
    setFormError(null)
    try {
      await api(`/empresa/trabajadores/${worker.id}/inhabilitar`, { method: 'POST', body: { reason: v.reason, detail: v.detail || null, ends_at: v.ends_at ? `${v.ends_at}T23:59` : null } })
      await qc.invalidateQueries({ queryKey: KEY })
      toast.ok('Inhabilitado. No podrá postular a tus turnos.')
      reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal open={worker !== null} onClose={onClose} title={`Inhabilitar a ${worker?.first_name ?? ''} ${worker?.last_name ?? ''}`}
      description="No podrá postular ni ser aceptado en tus turnos. Sus registros anteriores se conservan. Solo tu empresa lo ve."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" type="submit" form="form-inhabilitar" loading={isSubmitting}>Inhabilitar</Button></>}>
      <form id="form-inhabilitar" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Motivo" placeholder="Inasistencias reiteradas" error={errors.reason?.message} {...register('reason')} />
        <TextAreaField label="Detalle" hint="Opcional." error={errors.detail?.message} {...register('detail')} />
        <TextField label="Hasta el día" type="date" hint="Déjalo vacío para que dure hasta que lo habilites." error={errors.ends_at?.message} {...register('ends_at')} />
      </form>
    </Modal>
  )
}

