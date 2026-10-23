import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Send } from 'lucide-react'
import { Button, Modal, Notice, PageHeader, Panel, Spinner, TextAreaField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { downloadPaymentsXlsx } from '../../lib/excel'
import { fmtMoney } from '../../lib/format'
import { fmtPeriod, LinesList, StatementStatusDot, type Line, type StatementStatus } from '../../lib/pagos'
import { PERIODS_KEY } from './Pagos'

interface Statement {
  id: number; rut: string; first_name: string; last_name: string; shifts: number; overtime_hours: number; amount: number
  status: StatementStatus; dispute_comment: string | null; admin_reply: string | null
}
interface Detail {
  period: { id: number; start_date: string; end_date: string; status: 'closed' | 'sent'; shifts: number; overtime_hours: number; amount: number }
  data: Statement[]
}

export default function PagoDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const key = ['empresa', 'periodo', id]
  const q = useQuery({ queryKey: key, queryFn: () => api<Detail>(`/empresa/periodos/${id}`) })
  const [viewing, setViewing] = useState<Statement | null>(null)
  const [replying, setReplying] = useState<Statement | null>(null)
  const [reply, setReply] = useState('')
  const [reopen, setReopen] = useState(false)

  const lines = useQuery({
    queryKey: ['empresa', 'liquidacion', viewing?.id],
    queryFn: () => api<{ data: Line[] }>(`/empresa/liquidaciones/${viewing!.id}`).then((r) => r.data),
    enabled: viewing !== null,
  })

  const refresh = async () => { await qc.invalidateQueries({ queryKey: key }); await qc.invalidateQueries({ queryKey: PERIODS_KEY }) }
  const fail = (fallback: string) => (e: unknown) => toast.error(e instanceof ApiError ? e.message : fallback)

  const send = useMutation({
    mutationFn: () => api<{ sent: number }>(`/empresa/periodos/${id}/enviar`, { method: 'POST' }),
    onSuccess: async (r) => { await refresh(); toast.ok(`Enviamos ${r.sent} ${r.sent === 1 ? 'resumen' : 'resúmenes'} por correo.`) },
    onError: fail('No pudimos enviar los resúmenes.'),
  })
  const reopenM = useMutation({
    mutationFn: () => api(`/empresa/periodos/${id}/reabrir`, { method: 'POST' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: PERIODS_KEY }); toast.ok('Período reabierto. Las asistencias vuelven a poder editarse.'); nav('/empresa/pagos') },
    onError: (e) => { fail('No pudimos reabrir el período.')(e); setReopen(false) },
  })
  const replyM = useMutation({
    mutationFn: () => api(`/empresa/liquidaciones/${replying!.id}/responder`, { method: 'POST', body: { reply } }),
    onSuccess: async () => { await refresh(); toast.ok('Respuesta enviada al trabajador.'); setReplying(null); setReply('') },
    onError: fail('No pudimos enviar la respuesta.'),
  })
  const csv = useMutation({
    mutationFn: async () => {
      const d = await api<{ period: Detail['period']; data: { rut: string; first_name: string; last_name: string; status: string; lines: Line[] }[] }>(`/empresa/periodos/${id}/detalle`)
      await downloadPaymentsXlsx({
        title: `Pagos ${fmtPeriod(d.period.start_date, d.period.end_date)}`,
        fileName: `pagos_${d.period.start_date}_${d.period.end_date}.xlsx`,
        workers: d.data.map((w) => ({ rut: w.rut, name: `${w.first_name} ${w.last_name}`, status: w.status, lines: w.lines })),
      })
    },
    onError: fail('No pudimos descargar el archivo.'),
  })

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar el período.'}</Notice>
  const { period, data: rows } = q.data
  const pending = rows.filter((r) => r.status === 'pending').length
  const disputed = rows.filter((r) => r.status === 'disputed').length
  const hasAccepted = rows.some((r) => r.status === 'accepted')

  return (
    <>
      <Link to="/empresa/pagos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-3 hover:text-tinta"><ArrowLeft className="size-4" aria-hidden /> Pagos</Link>
      <PageHeader
        title={fmtPeriod(period.start_date, period.end_date)}
        subtitle={`${period.shifts} ${period.shifts === 1 ? 'turno' : 'turnos'}${period.overtime_hours > 0 ? ` · ${period.overtime_hours} h extra` : ''} · Total bruto ${fmtMoney(period.amount)}`}
        actions={<>
          <Button variant="secondary" loading={csv.isPending} onClick={() => csv.mutate()}><Download className="size-4" aria-hidden /> Descargar Excel</Button>
          {pending > 0 && <Button loading={send.isPending} onClick={() => send.mutate()}><Send className="size-4" aria-hidden /> Enviar {pending === 1 ? 'resumen' : `${pending} resúmenes`}</Button>}
        </>}
      />

      {pending > 0 && <Notice tone="info" className="mb-5">Los resúmenes aún no se han enviado. Revisa cada uno y, cuando esté bien, envíalos: cada trabajador recibe un correo con su monto.</Notice>}
      {disputed > 0 && <Notice tone="aviso" className="mb-5">{disputed === 1 ? 'Un trabajador reclamó' : `${disputed} trabajadores reclamaron`} su resumen. Responde para que pueda aceptarlo.</Notice>}

      <Panel className="overflow-hidden">
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-linea px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="min-w-52 flex-1">
                  <p className="font-medium">{r.first_name} {r.last_name}</p>
                  <p className="text-sm text-tinta-3">{r.rut} · {r.shifts} {r.shifts === 1 ? 'turno' : 'turnos'}{r.overtime_hours > 0 && ` · ${r.overtime_hours} h extra`}</p>
                </div>
                <div className="w-44"><StatementStatusDot status={r.status} /></div>
                <p className="w-28 text-right font-medium">{fmtMoney(r.amount)}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>Ver detalle</Button>
                  {r.status === 'disputed' && <Button size="sm" onClick={() => { setReplying(r); setReply(r.admin_reply ?? '') }}>Responder</Button>}
                </div>
              </div>
              {r.status === 'disputed' && r.dispute_comment && (
                <p className="mt-3 rounded-control bg-aviso-suave px-3 py-2 text-sm text-aviso">Reclamo: {r.dispute_comment}</p>
              )}
              {r.status === 'sent' && r.admin_reply && (
                <p className="mt-3 rounded-control bg-arena px-3 py-2 text-sm text-tinta-2">Tu respuesta: {r.admin_reply}</p>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-6">
        <Button variant="ghost" disabled={hasAccepted} onClick={() => setReopen(true)}>Reabrir período</Button>
        {hasAccepted && <p className="mt-1 text-sm text-tinta-3">No se puede reabrir: hay trabajadores que ya aceptaron su resumen.</p>}
      </div>

      <Modal open={viewing !== null} onClose={() => setViewing(null)} wide
        title={viewing ? `${viewing.first_name} ${viewing.last_name}` : ''} description={fmtPeriod(period.start_date, period.end_date)}
        footer={<Button variant="ghost" onClick={() => setViewing(null)}>Cerrar</Button>}>
        {lines.isLoading ? <Spinner /> : lines.isError ? <Notice tone="error">No pudimos cargar el detalle.</Notice> : <LinesList lines={lines.data ?? []} />}
      </Modal>

      <Modal open={replying !== null} onClose={() => setReplying(null)} title="Responder reclamo"
        description={replying ? `${replying.first_name} ${replying.last_name}: ${replying.dispute_comment ?? ''}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setReplying(null)}>Cancelar</Button><Button loading={replyM.isPending} disabled={reply.trim().length < 3} onClick={() => replyM.mutate()}>Enviar respuesta</Button></>}>
        <TextAreaField label="Tu respuesta" hint="El trabajador la recibe por correo y puede aceptar el resumen." maxLength={500} value={reply} onChange={(e) => setReply(e.target.value)} />
      </Modal>

      <Modal open={reopen} onClose={() => setReopen(false)} title="Reabrir período"
        description="Se borran los resúmenes de este período y las asistencias vuelven a poder editarse. Después tendrás que cerrarlo otra vez."
        footer={<><Button variant="ghost" onClick={() => setReopen(false)}>Volver</Button><Button variant="danger" loading={reopenM.isPending} onClick={() => reopenM.mutate()}>Reabrir período</Button></>}>
        {period.status === 'sent' && <Notice tone="aviso">Los trabajadores ya recibieron su resumen por correo; dejarán de verlo hasta que lo vuelvas a enviar.</Notice>}
      </Modal>
    </>
  )
}
