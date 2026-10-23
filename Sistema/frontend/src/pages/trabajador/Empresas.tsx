import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { fmtDate } from '../../lib/format'

interface Row { id: number; company: string; status: 'active' | 'inactive'; since: string | null }

export default function MisEmpresas() {
  const qc = useQueryClient()
  const toast = useToast()
  const [toLeave, setToLeave] = useState<Row | null>(null)
  const q = useQuery({ queryKey: ['trab', 'empresas'], queryFn: () => api<{ data: Row[] }>('/trabajador/empresas').then((r) => r.data) })

  const leave = useMutation({
    mutationFn: (r: Row) => api(`/trabajador/empresas/${r.id}/salir`, { method: 'POST' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trab'] }); toast.ok('Saliste de la bolsa de esa empresa.'); setToLeave(null) },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos sacarte de la bolsa.'); setToLeave(null) },
  })
  const rows = q.data ?? []

  return (
    <>
      <PageHeader title="Mis empresas" subtitle="Las empresas que te invitaron y aceptaste. Solo ves ofertas de ellas." />
      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? <div className="p-6"><Notice tone="error">No pudimos cargar tus empresas.</Notice></div> : rows.length === 0 ? (
          <EmptyState title="Aún no perteneces a ninguna empresa">Cuando una empresa te invite con tu RUT, verás la invitación en Inicio.</EmptyState>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="min-w-52 flex-1"><p className="font-medium">{r.company}</p><p className="text-sm text-tinta-3">Desde {fmtDate(r.since)}</p></div>
                <div className="w-40 text-sm"><StatusDot tone={r.status === 'active' ? 'ok' : 'idle'}>{r.status === 'active' ? 'Activa' : 'Pausada por la empresa'}</StatusDot></div>
                <Button size="sm" variant="ghost" onClick={() => setToLeave(r)}>Salir de la bolsa</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Modal open={toLeave !== null} onClose={() => setToLeave(null)} title={`Salir de ${toLeave?.company ?? ''}`}
        description="Dejarás de ver sus ofertas y se retirarán tus postulaciones pendientes. Tu historial de turnos se conserva. Si tienes turnos aceptados próximos, primero debes terminarlos."
        footer={<><Button variant="ghost" onClick={() => setToLeave(null)}>Volver</Button><Button variant="danger" loading={leave.isPending} onClick={() => toLeave && leave.mutate(toLeave)}>Salir de la bolsa</Button></>}>
        <p className="text-sm text-tinta-2">Para volver, la empresa tendría que invitarte otra vez.</p>
      </Modal>
    </>
  )
}
