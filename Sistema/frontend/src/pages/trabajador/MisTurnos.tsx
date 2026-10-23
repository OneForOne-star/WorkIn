import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextAreaField, TextField, cx } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime, fmtMoney, fmtTime } from '../../lib/format'
import type { MyShift } from './types'

const TEXT: Record<MyShift['status'], { tone: 'ok' | 'aviso' | 'idle' | 'error'; text: string }> = {
  applied: { tone: 'aviso', text: 'Esperando respuesta' }, accepted: { tone: 'ok', text: 'Aceptado' }, rejected: { tone: 'idle', text: 'No te eligieron' },
  withdrawn: { tone: 'idle', text: 'Retiraste tu postulación' }, cancelled: { tone: 'idle', text: 'Cancelado' }, no_show: { tone: 'error', text: 'Marcado como ausente' },
}

export default function MisTurnos() {
  const qc = useQueryClient()
  const toast = useToast()
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming')
  const [toWithdraw, setToWithdraw] = useState<MyShift | null>(null)
  const [asking, setAsking] = useState<MyShift | null>(null)
  const [otHours, setOtHours] = useState('')
  const [otReason, setOtReason] = useState('')
  const [otError, setOtError] = useState<string | null>(null)

  const q = useQuery({ queryKey: ['trab', 'mis-turnos', scope], queryFn: () => api<{ data: MyShift[] }>('/trabajador/mis-turnos', { query: { scope } }).then((r) => r.data) })

  const withdraw = useMutation({
    mutationFn: (s: MyShift) => api(`/trabajador/postulaciones/${s.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trab'] }); toast.ok('Listo, retiraste tu participación.'); setToWithdraw(null) },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos retirarte.'); setToWithdraw(null) },
  })

  const ask = useMutation({
    mutationFn: () => {
      const n = Number(otHours.replace(',', '.'))
      if (!(n >= 0.25 && n <= 12)) throw new ApiError(422, 'Indica las horas entre 0,25 y 12. Por ejemplo, 1,5.')
      if (otReason.trim().length < 3) throw new ApiError(422, 'Cuenta brevemente por qué trabajaste más tiempo.')
      return api(`/trabajador/mis-turnos/${asking!.id}/horas-extra`, { method: 'POST', body: { hours: n, reason: otReason.trim() } })
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trab'] }); toast.ok('Enviamos tu solicitud a la empresa.'); setAsking(null) },
    onError: (e) => setOtError(e instanceof ApiError ? e.message : 'No pudimos enviar la solicitud.'),
  })
  const cancelAsk = useMutation({
    mutationFn: (id: number) => api(`/trabajador/horas-extra/solicitudes/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trab'] }); toast.ok('Retiraste tu solicitud.') },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos retirar la solicitud.'),
  })

  const rows = q.data ?? []
  const now = Date.now()

  return (
    <>
      <PageHeader title="Mis turnos" subtitle="Tus postulaciones, los turnos que te aceptaron y tu historial." />

      <div role="tablist" aria-label="Período" className="mb-4 flex gap-1.5">
        {([['upcoming', 'Próximos'], ['past', 'Pasados']] as const).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={scope === v} onClick={() => setScope(v)}
            className={cx('rounded-control px-3.5 py-2 text-sm font-medium transition-colors', scope === v ? 'bg-tinta text-crema' : 'text-tinta-2 hover:bg-arena')}>{label}</button>
        ))}
      </div>

      {q.isLoading ? <Spinner /> : q.isError ? <Notice tone="error">No pudimos cargar tus turnos.</Notice> : rows.length === 0 ? (
        <Panel><EmptyState title={scope === 'upcoming' ? 'No tienes turnos próximos' : 'Aún no tienes historial'}>{scope === 'upcoming' ? 'Postula a una oferta para verla aquí.' : 'Tus turnos terminados aparecerán aquí.'}</EmptyState></Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul>
            {rows.map((s) => {
              const canMark = s.status === 'accepted' && s.shift_status === 'published'
                && now >= new Date(s.windows.check_in_opens_at).getTime() && now <= new Date(s.windows.check_out_closes_at).getTime() && !s.check_out_at
              const canWithdraw = scope === 'upcoming' && (s.status === 'applied' || s.status === 'accepted') && !s.check_in_at
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-tinta-3">{s.company} · {s.location.name}</p>
                    <p className="mt-1 text-sm">{fmtDateTime(s.starts_at)} a {fmtTime(s.ends_at)}{s.pay?.shift_amount != null && <span className="text-tinta-3"> · {fmtMoney(s.pay?.shift_amount)} por turno</span>}</p>
                  </div>
                  <div className="w-52 text-sm">
                    <StatusDot tone={s.shift_status === 'cancelled' ? 'idle' : TEXT[s.status].tone}>{s.shift_status === 'cancelled' ? 'Turno cancelado' : TEXT[s.status].text}</StatusDot>
                    {s.check_in_at && <p className="mt-0.5 pl-4 text-tinta-3">Entrada {fmtTime(s.check_in_at)}{s.check_out_at ? ` · Salida ${fmtTime(s.check_out_at)}` : ''}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canMark && <Link to="/trabajador/marcar"><Button size="sm"><QrCode className="size-4" aria-hidden /> Marcar</Button></Link>}
                    {s.overtime.can_request && <Button size="sm" variant="secondary" onClick={() => { setAsking(s); setOtHours(''); setOtReason(''); setOtError(null) }}>Pedir horas extra</Button>}
                    {canWithdraw && <Button size="sm" variant="ghost" onClick={() => setToWithdraw(s)}>{s.status === 'accepted' ? 'No podré ir' : 'Retirar'}</Button>}
                  </div>
                  {(s.overtime.authorized_hours > 0 || s.overtime.request) && (
                    <div className="w-full space-y-1 text-sm">
                      {s.overtime.authorized_hours > 0 && <p className="text-tinta-2">Horas extra aprobadas: {String(s.overtime.authorized_hours).replace('.', ',')} h</p>}
                      {s.overtime.request?.status === 'pending' && (
                        <p className="flex flex-wrap items-center gap-x-3 text-tinta-2">
                          <StatusDot tone="aviso">Pediste {String(s.overtime.request.hours).replace('.', ',')} h extra: esperando respuesta</StatusDot>
                          <Button size="sm" variant="ghost" loading={cancelAsk.isPending && cancelAsk.variables === s.overtime.request.id} onClick={() => cancelAsk.mutate(s.overtime.request!.id)}>Retirar solicitud</Button>
                        </p>
                      )}
                      {s.overtime.request?.status === 'rejected' && <p className="text-tinta-3">La empresa no aprobó tu solicitud de {String(s.overtime.request.hours).replace('.', ',')} h{s.overtime.request.resolution_comment ? `: ${s.overtime.request.resolution_comment}` : '.'}</p>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <Modal open={asking !== null} onClose={() => setAsking(null)} title="Pedir horas extra"
        description="La empresa decide. Solo se pagan las horas que apruebe, y te avisamos por correo cuando responda."
        footer={<><Button variant="ghost" onClick={() => setAsking(null)}>Volver</Button><Button loading={ask.isPending} onClick={() => { setOtError(null); ask.mutate() }}>Enviar solicitud</Button></>}>
        <div className="space-y-5">
          {otError && <Notice tone="error">{otError}</Notice>}
          <p className="text-sm text-tinta-2">{asking?.title} · {asking && fmtDateTime(asking.starts_at)}</p>
          <TextField label="Horas extra" inputMode="decimal" placeholder="1,5" hint="Se redondean a tramos de 15 minutos." wrapperClassName="sm:max-w-40" value={otHours} onChange={(e) => setOtHours(e.target.value)} />
          <TextAreaField label="Motivo" placeholder="Nos pidieron terminar de descargar el camión" value={otReason} onChange={(e) => setOtReason(e.target.value)} />
        </div>
      </Modal>

      <Modal open={toWithdraw !== null} onClose={() => setToWithdraw(null)}
        title={toWithdraw?.status === 'accepted' ? 'Dejar este turno' : 'Retirar postulación'}
        description={toWithdraw?.status === 'accepted' ? 'Ya estás aceptado. Si faltan muy pocas horas, el sistema no lo permite y tendrás que avisar directamente a la empresa.' : 'La empresa dejará de verte entre las postulaciones.'}
        footer={<><Button variant="ghost" onClick={() => setToWithdraw(null)}>Volver</Button><Button variant="danger" loading={withdraw.isPending} onClick={() => toWithdraw && withdraw.mutate(toWithdraw)}>Confirmar</Button></>}>
        <p className="text-sm text-tinta-2">{toWithdraw?.title} · {toWithdraw && fmtDateTime(toWithdraw.starts_at)}</p>
      </Modal>
    </>
  )
}
