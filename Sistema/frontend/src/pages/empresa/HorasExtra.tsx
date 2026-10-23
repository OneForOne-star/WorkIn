import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { fmtDate, fmtDateTime, fmtTime } from '../../lib/format'
import { RespondModal } from '../../lib/horasextra'

interface Req { id: number; shift_id: number; worker: string; rut: string; title: string; date: string; ends_at: string; check_in_at: string | null; check_out_at: string | null; hours: number; reason: string; authorized_hours: number; created_at: string }
interface Late { attendance_id: number; rut: string; worker: string; title: string; date: string; ends_at: string; check_out_at: string; late_minutes: number }
interface Resp { requests: Req[]; late_exits: Late[] }

const KEY = ['empresa', 'horas-extra']
const dur = (m: number) => `${m >= 60 ? `${Math.floor(m / 60)} h ` : ''}${m % 60 ? `${m % 60} min` : ''}`.trim()

/** Lo que hay que decidir sobre horas extra: solicitudes de los trabajadores y salidas tardías sin autorizar. */
export default function HorasExtra() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: KEY, queryFn: () => api<Resp>('/empresa/horas-extra') })
  const [resp, setResp] = useState<Req | null>(null)
  const [auth, setAuth] = useState<Late | null>(null)
  const [hours, setHours] = useState('')

  const refresh = async () => { await qc.invalidateQueries({ queryKey: KEY }); await qc.invalidateQueries({ queryKey: ['empresa', 'pendiente'] }); await qc.invalidateQueries({ queryKey: ['empresa', 'turno'] }) }

  const authorize = useMutation({
    mutationFn: () => {
      const n = Number(hours.replace(',', '.'))
      if (!(n >= 0.25 && n <= 12)) throw new ApiError(422, 'Indica las horas entre 0,25 y 12.')
      return api(`/empresa/asistencias/${auth!.attendance_id}/horas-extra`, { method: 'POST', body: { hours: n, comments: 'Salida tardía revisada por la empresa' } })
    },
    onSuccess: async () => { await refresh(); toast.ok('Horas extra autorizadas.'); setAuth(null) },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos autorizar las horas.'),
  })

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <Notice tone="error">No pudimos cargar las horas extra.</Notice>
  const { requests, late_exits: late } = q.data

  return (
    <>
      <PageHeader title="Horas extra" subtitle="Solo se pagan las horas extra que autorizas. Aquí respondes lo que piden los trabajadores y revisas salidas tardías que nadie ha autorizado." />

      <h2 className="mb-3 text-lg font-semibold">Solicitudes de los trabajadores</h2>
      {requests.length === 0 ? (
        <Panel className="mb-8"><EmptyState title="No hay solicitudes pendientes">Cuando un trabajador pida horas extra por un turno ya marcado, aparecerá aquí y te avisaremos por correo.</EmptyState></Panel>
      ) : (
        <Panel className="mb-8 overflow-hidden">
          <ul>
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{r.worker} <span className="font-normal text-tinta-3">· {r.rut}</span></p>
                  <p className="text-sm text-tinta-3"><Link to={`/empresa/turnos/${r.shift_id}`} className="underline">{r.title}</Link> · {fmtDate(r.date)} · terminaba {fmtTime(r.ends_at)}, salió {fmtTime(r.check_out_at)}</p>
                  <p className="mt-1 text-sm"><strong>Pide {String(r.hours).replace('.', ',')} h:</strong> {r.reason}</p>
                  {r.authorized_hours > 0 && <p className="text-sm text-tinta-3">Ya hay {String(r.authorized_hours).replace('.', ',')} h autorizadas en este turno.</p>}
                </div>
                <p className="text-sm text-tinta-3">Pedida {fmtDateTime(r.created_at)}</p>
                <Button size="sm" onClick={() => setResp(r)}>Responder</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <h2 className="mb-1 text-lg font-semibold">Salidas tardías sin horas extra</h2>
      <p className="mb-3 text-sm text-tinta-3">Personas que marcaron la salida bastante después del término del turno y no tienen horas extra autorizadas por ese tiempo. Si no autorizas nada, solo se paga el turno.</p>
      {late.length === 0 ? (
        <Panel><EmptyState title="Todo al día">No hay salidas tardías pendientes de revisar en períodos sin cerrar.</EmptyState></Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul>
            {late.map((l) => (
              <li key={l.attendance_id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <AlertTriangle className="size-5 shrink-0 text-aviso" aria-hidden />
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{l.worker} <span className="font-normal text-tinta-3">· {l.rut}</span></p>
                  <p className="text-sm text-tinta-3">{l.title} · {fmtDate(l.date)} · terminaba {fmtTime(l.ends_at)}, salió {fmtTime(l.check_out_at)}</p>
                  <p className="mt-0.5 text-sm">{dur(l.late_minutes)} sin autorizar</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => { setAuth(l); setHours(String(l.late_minutes / 60).replace('.', ',')) }}>Autorizar horas</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <RespondModal open={resp !== null} onClose={() => setResp(null)} request={resp ? { id: resp.id, hours: resp.hours, reason: resp.reason } : null} who={resp?.worker ?? ''} onDone={refresh} />

      <Modal open={auth !== null} onClose={() => setAuth(null)} title={`Autorizar horas extra: ${auth?.worker ?? ''}`}
        description={auth ? `${auth.title} · ${fmtDate(auth.date)}. Sugerimos ${dur(auth.late_minutes)} según su hora de salida; ajusta si corresponde.` : undefined}
        footer={<><Button variant="ghost" onClick={() => setAuth(null)}>Volver</Button><Button loading={authorize.isPending} onClick={() => authorize.mutate()}>Autorizar</Button></>}>
        <TextField label="Horas" inputMode="decimal" wrapperClassName="sm:max-w-40" value={hours} onChange={(e) => setHours(e.target.value)} />
      </Modal>
    </>
  )
}
