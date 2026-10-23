import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Modal, Notice, TextAreaField, TextField } from '../components/ui'
import { useToast } from '../components/toast'
import { api, ApiError } from './api'

export interface OvertimeRequest { id: number; hours: number; reason: string }

const comma = (n: number) => String(n).replace('.', ',')

/** Responder la solicitud de un trabajador: aprobar (con las horas que quieras) o rechazar con un motivo. */
export function RespondModal({ open, onClose, request, who, onDone }: {
  open: boolean; onClose: () => void; request: OvertimeRequest | null; who: string; onDone: () => Promise<void> | void
}) {
  const toast = useToast()
  const [hours, setHours] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const value = hours ?? (request ? comma(request.hours) : '')

  const done = async (msg: string) => { await onDone(); toast.ok(msg); setHours(null); setComment(''); setError(null); onClose() }
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'No pudimos responder la solicitud.')

  const approve = useMutation({
    mutationFn: () => {
      const n = Number(value.replace(',', '.'))
      if (!(n >= 0.25 && n <= 12)) throw new ApiError(422, 'Indica las horas entre 0,25 y 12.')
      return api(`/empresa/horas-extra/solicitudes/${request!.id}/aprobar`, { method: 'POST', body: { hours: n, comment: comment.trim() || null } })
    },
    onSuccess: () => done('Horas extra aprobadas. Avisamos al trabajador.'), onError: fail,
  })
  const reject = useMutation({
    mutationFn: () => {
      if (comment.trim().length < 3) throw new ApiError(422, 'Para rechazar, escribe un motivo (al menos 3 letras).')
      return api(`/empresa/horas-extra/solicitudes/${request!.id}/rechazar`, { method: 'POST', body: { comment: comment.trim() } })
    },
    onSuccess: () => done('Solicitud rechazada. Avisamos al trabajador.'), onError: fail,
  })

  return (
    <Modal open={open && request !== null} onClose={onClose} title={`Solicitud de ${who}`}
      description="Solo se pagan las horas extra que apruebas. Puedes aprobar menos horas de las que pidió."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        <Button variant="secondary" loading={reject.isPending} disabled={approve.isPending} onClick={() => { setError(null); reject.mutate() }}>Rechazar</Button>
        <Button loading={approve.isPending} disabled={reject.isPending} onClick={() => { setError(null); approve.mutate() }}>Aprobar</Button>
      </>}>
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        {request && <p className="rounded-control bg-arena px-3.5 py-2.5 text-sm"><span className="text-tinta-3">Pidió {comma(request.hours)} h:</span> {request.reason}</p>}
        <TextField label="Horas a aprobar" inputMode="decimal" wrapperClassName="sm:max-w-40" value={value} onChange={(e) => setHours(e.target.value)} />
        <TextAreaField label="Comentario" hint="Opcional al aprobar; obligatorio al rechazar. El trabajador lo recibe por correo." value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
    </Modal>
  )
}
