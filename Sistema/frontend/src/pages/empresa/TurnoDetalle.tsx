import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft, Check, Clock, Pencil, Send, UserMinus, X } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextAreaField, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { fmtDateTime, fmtMoney, fmtTime, isoToLocalInput } from '../../lib/format'
import { formatPhone } from '../../lib/rut'
import { RespondModal, type OvertimeRequest } from '../../lib/horasextra'
import { ShiftModal, type Shift } from './ShiftModal'
import { SHIFT_STATUS } from './Turnos'

type AStatus = 'applied' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled' | 'no_show'
interface Application {
  id: number; user_id: number; status: AStatus; rut: string; first_name: string; last_name: string; phone: string | null
  priority: 'alta' | 'media' | 'baja' | null; applied_at: string | null; decided_at: string | null
  attendance: { id: number; check_in_at: string | null; check_out_at: string | null } | null
}
interface Summary { completed_count: number; overtime_hours: number; shift_amount: number; overtime_hour_amount: number; shifts_total: number; overtime_total: number; total: number }
interface AttRow {
  assignment_id: number; status: AStatus; rut: string; first_name: string; last_name: string
  attendance_id: number | null; check_in_at: string | null; check_in_method: string | null
  check_out_at: string | null; check_out_method: string | null; comments: string | null; locked: boolean
  overtime_hours: number; overtime: Array<{ id: number; hours: number; comments: string | null }>
  late_minutes: number; request: OvertimeRequest | null
}

const A_TEXT: Record<AStatus, { tone: 'ok' | 'aviso' | 'idle' | 'error'; text: string }> = {
  applied: { tone: 'aviso', text: 'Por decidir' }, accepted: { tone: 'ok', text: 'Aceptado' }, rejected: { tone: 'idle', text: 'Rechazado' },
  withdrawn: { tone: 'idle', text: 'Retiró su postulación' }, cancelled: { tone: 'idle', text: 'Retirado' }, no_show: { tone: 'error', text: 'No llegó' },
}
const METHOD: Record<string, string> = { qr: 'QR', manual: 'Manual' }

export default function TurnoDetalle() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const shiftQ = useQuery({ queryKey: ['empresa', 'turno', id], queryFn: () => api<{ shift: Shift }>(`/empresa/turnos/${id}`).then((r) => r.shift) })
  const appsQ = useQuery({ queryKey: ['empresa', 'turno', id, 'postulaciones'], queryFn: () => api<{ data: Application[] }>(`/empresa/turnos/${id}/postulaciones`).then((r) => r.data) })
  const attQ = useQuery({ queryKey: ['empresa', 'turno', id, 'asistencia'], queryFn: () => api<{ data: AttRow[]; summary: Summary }>(`/empresa/turnos/${id}/asistencia`) })

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['empresa', 'turno', id] })
    await qc.invalidateQueries({ queryKey: ['empresa', 'turnos'] })
  }
  const onErr = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'No pudimos completar la acción.')

  const publish = useMutation({
    mutationFn: () => api(`/empresa/turnos/${id}/publicar`, { method: 'POST' }),
    onSuccess: async () => { await refresh(); toast.ok('Turno publicado. Avisamos a tu bolsa.') }, onError: onErr,
  })
  const act = useMutation({
    mutationFn: ({ aid, verb }: { aid: number; verb: 'aceptar' | 'rechazar' | 'retirar' | 'ausente' }) => api(`/empresa/postulaciones/${aid}/${verb}`, { method: 'POST' }),
    onSuccess: async (_r, v) => {
      await refresh()
      toast.ok({ aceptar: 'Aceptado. Le avisamos por correo.', rechazar: 'Postulación rechazada.', retirar: 'Retirado del turno.', ausente: 'Marcado como ausente.' }[v.verb])
    },
    onError: onErr,
  })

  if (shiftQ.isLoading) return <Spinner />
  if (shiftQ.isError || !shiftQ.data) {
    return <Notice tone="error">{shiftQ.error instanceof ApiError && shiftQ.error.status === 404 ? 'Ese turno no existe.' : 'No pudimos cargar el turno.'} <Link className="underline" to="/empresa/turnos">Volver a turnos</Link></Notice>
  }
  const s = shiftQ.data
  const apps = appsQ.data ?? []
  const accepted = apps.filter((a) => a.status === 'accepted').length
  const full = accepted >= s.slots
  const started = new Date(s.starts_at).getTime() <= Date.now()
  const editable = s.status === 'draft' || s.status === 'published'

  return (
    <>
      <Link to="/empresa/turnos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-3 hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> Turnos</Link>
      <PageHeader
        title={s.title}
        subtitle={`${s.location.name} · ${fmtDateTime(s.starts_at)} a ${fmtTime(s.ends_at)}`}
        actions={editable && (
          <>
            {s.status === 'draft' && <Button loading={publish.isPending} onClick={() => publish.mutate()}><Send className="size-4" aria-hidden /> Publicar</Button>}
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" aria-hidden /> Editar</Button>
            {!started && <Button variant="ghost" onClick={() => setCancelling(true)}>Cancelar turno</Button>}
          </>
        )}
      />

      <Panel className="mb-6 p-5">
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="text-tinta-3">Estado</dt><dd className="mt-1"><StatusDot tone={SHIFT_STATUS[s.status].tone}>{SHIFT_STATUS[s.status].text}</StatusDot></dd></div>
          <div><dt className="text-tinta-3">Cupos</dt><dd className="mt-1 font-medium">{accepted} de {s.slots} aceptados</dd></div>
          <div><dt className="text-tinta-3">Tipo</dt><dd className="mt-1 font-medium">{[s.is_night && 'Noche', s.is_holiday && 'Festivo'].filter(Boolean).join(' y ') || 'Normal'}</dd></div>
          <div><dt className="text-tinta-3">Tarifa fija de la oferta</dt><dd className="mt-1 font-medium">{s.rate?.name ?? '—'}<span className="block text-tinta-2 font-normal">{fmtMoney(s.rate?.shift_amount)} por turno · {fmtMoney(s.rate?.overtime_hour_amount)} hora extra</span></dd></div>
          <div><dt className="text-tinta-3">Prioridad baja lo ve desde</dt><dd className="mt-1 font-medium">{s.low_priority_visible_at ? fmtDateTime(s.low_priority_visible_at) : 'Al publicar'}</dd></div>
        </dl>
        {s.notes && <p className="mt-4 border-t border-linea pt-4 text-sm text-tinta-2">{s.notes}</p>}
        {s.status === 'cancelled' && <Notice tone="aviso" className="mt-4">Turno cancelado: {s.cancellation_reason}</Notice>}
      </Panel>

      <h2 className="mb-3 text-lg font-semibold">Postulaciones</h2>
      <Panel className="mb-8 overflow-hidden">
        {appsQ.isLoading ? <Spinner /> : apps.length === 0 ? (
          <EmptyState title="Nadie ha postulado todavía">{s.status === 'draft' ? 'Publica el turno para que tu bolsa lo vea.' : 'Cuando alguien postule aparecerá aquí.'}</EmptyState>
        ) : (
          <ul>
            {apps.map((a) => {
              const busy = act.isPending && act.variables?.aid === a.id
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{a.first_name} {a.last_name}</p>
                    <p className="text-sm text-tinta-3">{a.rut}{a.phone ? ` · ${formatPhone(a.phone)}` : ''}{a.priority ? ` · prioridad ${a.priority}` : ''}</p>
                  </div>
                  <div className="w-44 text-sm"><StatusDot tone={A_TEXT[a.status].tone}>{A_TEXT[a.status].text}</StatusDot><p className="mt-0.5 pl-4 text-tinta-3">Postuló {fmtDateTime(a.applied_at)}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === 'applied' && s.status === 'published' && (
                      <>
                        <Button size="sm" disabled={full} loading={busy && act.variables?.verb === 'aceptar'} onClick={() => act.mutate({ aid: a.id, verb: 'aceptar' })}><Check className="size-4" aria-hidden /> {full ? 'Sin cupos' : 'Aceptar'}</Button>
                        <Button size="sm" variant="ghost" loading={busy && act.variables?.verb === 'rechazar'} onClick={() => act.mutate({ aid: a.id, verb: 'rechazar' })}><X className="size-4" aria-hidden /> Rechazar</Button>
                      </>
                    )}
                    {a.status === 'accepted' && !a.attendance && (
                      started
                        ? <Button size="sm" variant="ghost" loading={busy} onClick={() => act.mutate({ aid: a.id, verb: 'ausente' })}><UserMinus className="size-4" aria-hidden /> Marcar ausente</Button>
                        : <Button size="sm" variant="ghost" loading={busy} onClick={() => act.mutate({ aid: a.id, verb: 'retirar' })}><UserMinus className="size-4" aria-hidden /> Retirar del turno</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {(attQ.data?.data.length ?? 0) > 0 && (
        <>
          <h2 className="mb-1 text-lg font-semibold">Asistencia</h2>
          <p className="mb-3 text-sm text-tinta-3">Lo que marcó cada persona con el QR. Si algo falló, puedes registrarlo a mano con un motivo; queda anotado quién lo hizo.</p>
          {attQ.data && (
            <Panel className="mb-4 p-5">
              <p className="text-sm text-tinta-3">Costo de este turno con la tarifa fija de la oferta</p>
              <p className="mt-1 text-2xl font-semibold">{fmtMoney(attQ.data.summary.total)}</p>
              <p className="mt-1 text-sm text-tinta-2">
                {attQ.data.summary.completed_count} {attQ.data.summary.completed_count === 1 ? 'turno completo' : 'turnos completos'} × {fmtMoney(attQ.data.summary.shift_amount)} = {fmtMoney(attQ.data.summary.shifts_total)}
                {attQ.data.summary.overtime_hours > 0 && <> · {attQ.data.summary.overtime_hours} h extra × {fmtMoney(attQ.data.summary.overtime_hour_amount)} = {fmtMoney(attQ.data.summary.overtime_total)}</>}
              </p>
              <p className="mt-1 text-xs text-tinta-3">Cuenta solo a quienes tienen entrada y salida registradas. Es bruto, antes de retenciones.</p>
            </Panel>
          )}
          <Panel className="overflow-hidden">
            <ul>
              {attQ.data!.data.map((r) => <AttendanceItem key={r.assignment_id} row={r} shift={s} onChanged={refresh} />)}
            </ul>
          </Panel>
        </>
      )}

      <ShiftModal target={editing ? { ...s, accepted_count: accepted } : null} onClose={() => setEditing(false)} />
      <CancelModal open={cancelling} shiftId={id} accepted={accepted} onClose={() => setCancelling(false)} onDone={refresh} />
    </>
  )
}

function AttendanceItem({ row, shift, onChanged }: { row: AttRow; shift: Shift; onChanged: () => Promise<void> }) {
  const [manual, setManual] = useState(false)
  const [overtime, setOvertime] = useState(false)
  const [responding, setResponding] = useState(false)
  const done = row.check_in_at && row.check_out_at

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
      <div className="min-w-56 flex-1">
        <p className="font-medium">{row.first_name} {row.last_name}</p>
        <p className="text-sm text-tinta-3">{row.rut}</p>
      </div>
      <div className="w-64 text-sm">
        {row.status === 'no_show' ? <StatusDot tone="error">No llegó</StatusDot> : (
          <>
            <p><span className="text-tinta-3">Entrada</span> {row.check_in_at ? <>{fmtDateTime(row.check_in_at)} <span className="text-tinta-3">({METHOD[row.check_in_method ?? ''] ?? '—'})</span></> : '—'}</p>
            <p><span className="text-tinta-3">Salida</span> {row.check_out_at ? <>{fmtDateTime(row.check_out_at)} <span className="text-tinta-3">({METHOD[row.check_out_method ?? ''] ?? '—'})</span></> : '—'}</p>
          </>
        )}
      </div>
      <div className="w-28 text-sm">{row.overtime_hours > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-4 text-tinta-3" aria-hidden /> {row.overtime_hours} h extra</span>}</div>
      <div className="flex flex-wrap gap-2">
        {row.status === 'accepted' && !row.locked && <Button size="sm" variant="secondary" onClick={() => setManual(true)}>Registrar a mano</Button>}
        {row.request && !row.locked && <Button size="sm" onClick={() => setResponding(true)}>Responder solicitud</Button>}
        {done && !row.locked && <Button size="sm" variant="ghost" onClick={() => setOvertime(true)}>Horas extra</Button>}
        {row.locked && <span className="text-sm text-tinta-3">Período cerrado</span>}
      </div>
      {row.request && !row.locked && (
        <p className="flex w-full items-start gap-2 rounded-control bg-arena px-3 py-2 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-tinta-3" aria-hidden />
          <span><strong>Pidió {String(row.request.hours).replace('.', ',')} h extra:</strong> {row.request.reason}</span>
        </p>
      )}
      {row.late_minutes > 0 && !row.locked && (
        <p className="flex w-full items-start gap-2 rounded-control bg-aviso-suave px-3 py-2 text-sm text-aviso">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Salió {Math.floor(row.late_minutes / 60) > 0 ? `${Math.floor(row.late_minutes / 60)} h ` : ''}{row.late_minutes % 60 > 0 ? `${row.late_minutes % 60} min ` : ''}después del término y no hay horas extra autorizadas por ese tiempo. Si corresponde, usa «Horas extra».</span>
        </p>
      )}
      <RespondModal open={responding} onClose={() => setResponding(false)} request={row.request} who={`${row.first_name} ${row.last_name}`} onDone={onChanged} />
      <ManualModal open={manual} onClose={() => setManual(false)} row={row} shift={shift} onDone={onChanged} />
      <OvertimeModal open={overtime} onClose={() => setOvertime(false)} row={row} onDone={onChanged} />
    </li>
  )
}

const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const manualSchema = z.object({
  check_in_at: z.string().refine((v) => v === '' || dt.test(v), 'Fecha no válida.'),
  check_out_at: z.string().refine((v) => v === '' || dt.test(v), 'Fecha no válida.'),
  comments: z.string().trim().min(3, 'Escribe el motivo (al menos 3 letras).').max(255),
})

function ManualModal({ open, onClose, row, shift, onDone }: { open: boolean; onClose: () => void; row: AttRow; shift: Shift; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof manualSchema>>({
    resolver: zodResolver(manualSchema),
    values: { check_in_at: isoToLocalInput(row.check_in_at ?? shift.starts_at), check_out_at: isoToLocalInput(row.check_out_at ?? ''), comments: '' },
  })
  async function onSubmit(v: z.infer<typeof manualSchema>) {
    setFormError(null)
    try {
      await api(`/empresa/postulaciones/${row.assignment_id}/asistencia`, { method: 'POST', body: { check_in_at: v.check_in_at || null, check_out_at: v.check_out_at || null, comments: v.comments } })
      await onDone(); toast.ok('Asistencia registrada.'); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Registrar a mano: ${row.first_name} ${row.last_name}`}
      description="Úsalo si el QR falló o la persona no pudo escanear. Queda anotado que lo hiciste tú, con tu motivo."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form={`form-manual-${row.assignment_id}`} loading={isSubmitting}>Guardar</Button></>}>
      <form id={`form-manual-${row.assignment_id}`} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Entrada" type="datetime-local" error={errors.check_in_at?.message} {...register('check_in_at')} />
          <TextField label="Salida" type="datetime-local" hint="Déjala vacía si aún no sale." error={errors.check_out_at?.message} {...register('check_out_at')} />
        </div>
        <TextAreaField label="Motivo" placeholder="Se cayó internet y no pudo escanear" error={errors.comments?.message} {...register('comments')} />
      </form>
    </Modal>
  )
}

const otSchema = z.object({
  hours: z.string().regex(/^\d+([.,]\d{1,2})?$/, 'Escribe las horas, por ejemplo 1,5.').refine((v) => { const n = Number(v.replace(',', '.')); return n >= 0.25 && n <= 12 }, 'Entre 0,25 y 12 horas.'),
  comments: z.string().trim().max(255),
})

function OvertimeModal({ open, onClose, row, onDone }: { open: boolean; onClose: () => void; row: AttRow; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof otSchema>>({ resolver: zodResolver(otSchema), defaultValues: { hours: '', comments: '' } })

  const remove = useMutation({
    mutationFn: (otId: number) => api(`/empresa/horas-extra/${otId}`, { method: 'DELETE' }),
    onSuccess: async () => { await onDone(); toast.ok('Horas extra quitadas.') },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos quitar las horas.'),
  })

  async function onSubmit(v: z.infer<typeof otSchema>) {
    if (!row.attendance_id) return
    setFormError(null)
    try {
      await api(`/empresa/asistencias/${row.attendance_id}/horas-extra`, { method: 'POST', body: { hours: Number(v.hours.replace(',', '.')), comments: v.comments || null } })
      await onDone(); toast.ok('Horas extra autorizadas.'); reset()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Horas extra: ${row.first_name} ${row.last_name}`}
      description="Solo se pagan las horas extra que autorizas aquí. Se redondean a tramos de 15 minutos."
      footer={<><Button variant="ghost" onClick={onClose}>Cerrar</Button><Button type="submit" form={`form-ot-${row.assignment_id}`} loading={isSubmitting}>Autorizar</Button></>}>
      <div className="space-y-5">
        {row.overtime.length > 0 && (
          <ul className="divide-y divide-linea rounded-control border border-linea bg-papel text-sm">
            {row.overtime.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span>{o.hours} h{o.comments ? <span className="text-tinta-3"> · {o.comments}</span> : ''}</span>
                <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === o.id} onClick={() => remove.mutate(o.id)}>Quitar</Button>
              </li>
            ))}
          </ul>
        )}
        <form id={`form-ot-${row.assignment_id}`} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {formError && <Notice tone="error">{formError}</Notice>}
          <TextField label="Horas" inputMode="decimal" placeholder="1,5" wrapperClassName="sm:max-w-40" error={errors.hours?.message} {...register('hours')} />
          <TextField label="Comentario" hint="Opcional." error={errors.comments?.message} {...register('comments')} />
        </form>
      </div>
    </Modal>
  )
}

const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo (al menos 3 letras).').max(255) })

function CancelModal({ open, shiftId, accepted, onClose, onDone }: { open: boolean; shiftId: number; accepted: number; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof cancelSchema>>({ resolver: zodResolver(cancelSchema) })
  async function onSubmit(v: z.infer<typeof cancelSchema>) {
    setFormError(null)
    try {
      await api(`/empresa/turnos/${shiftId}/cancelar`, { method: 'POST', body: v })
      await onDone(); toast.ok('Turno cancelado.'); reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cancelar turno"
      description={accepted > 0 ? `Le avisaremos por correo a las ${accepted} personas aceptadas, con el motivo que escribas.` : 'Nadie está aceptado todavía, así que no se enviará ningún aviso.'}
      footer={<><Button variant="ghost" onClick={onClose}>Volver</Button><Button variant="danger" type="submit" form="form-cancelar" loading={isSubmitting}>Cancelar turno</Button></>}>
      <form id="form-cancelar" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextAreaField label="Motivo" error={errors.reason?.message} {...register('reason')} />
      </form>
    </Modal>
  )
}
