import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, ExternalLink, MapPin, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'

interface Location { id: number; name: string; address: string | null; is_active: boolean; has_display_link: boolean }
interface Issued { name: string; url: string }

const KEY = ['empresa', 'lugares']

export default function Lugares() {
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Location | 'new' | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [toDelete, setToDelete] = useState<Location | null>(null)
  const [toRegen, setToRegen] = useState<Location | null>(null)

  const q = useQuery({ queryKey: KEY, queryFn: () => api<{ data: Location[] }>('/empresa/lugares').then((r) => r.data) })

  const toggle = useMutation({
    mutationFn: (l: Location) => api(`/empresa/lugares/${l.id}`, { method: 'PATCH', body: { is_active: !l.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos actualizar el lugar.'),
  })

  const remove = useMutation({
    mutationFn: (l: Location) => api(`/empresa/lugares/${l.id}`, { method: 'DELETE' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: KEY }); toast.ok('Lugar eliminado.'); setToDelete(null) },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos eliminar el lugar.'); setToDelete(null) },
  })

  const regen = useMutation({
    mutationFn: (l: Location) => api<{ display_url: string }>(`/empresa/lugares/${l.id}/pantalla`, { method: 'POST' }).then((r) => ({ name: l.name, url: r.display_url })),
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: KEY }); setToRegen(null); setIssued(r) },
    onError: (e) => { toast.error(e instanceof ApiError ? e.message : 'No pudimos generar el enlace.'); setToRegen(null) },
  })

  const rows = q.data ?? []

  return (
    <>
      <PageHeader
        title="Lugares de trabajo"
        subtitle="Cada lugar tiene su propia pantalla con un QR que cambia cada 5 minutos. Los trabajadores lo escanean para marcar entrada y salida."
        actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Nuevo lugar</Button>}
      />

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar los lugares.'}</Notice></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Aún no tienes lugares" action={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Crear el primero</Button>}>
            Necesitas al menos un lugar para publicar turnos.
          </EmptyState>
        ) : (
          <ul>
            {rows.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="flex min-w-56 flex-1 items-start gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-tinta-3" aria-hidden />
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-tinta-3">{l.address || 'Sin dirección'}</p>
                  </div>
                </div>
                <div className="w-40 text-sm">
                  <StatusDot tone={l.is_active ? 'ok' : 'idle'}>{l.is_active ? 'Activo' : 'Inactivo'}</StatusDot>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setToRegen(l)}>
                    <QrCode className="size-4" aria-hidden /> {l.has_display_link ? 'Nuevo enlace de pantalla' : 'Crear enlace de pantalla'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(l)}><Pencil className="size-4" aria-hidden /> Editar</Button>
                  <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === l.id} onClick={() => toggle.mutate(l)}>
                    {l.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(l)} aria-label={`Eliminar ${l.name}`}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <LocationModal
        target={editing}
        onClose={() => setEditing(null)}
        onCreated={(r) => setIssued(r)}
      />

      <DisplayLinkModal issued={issued} onClose={() => setIssued(null)} />

      <Modal
        open={toRegen !== null}
        onClose={() => setToRegen(null)}
        title={`Enlace de pantalla de ${toRegen?.name ?? ''}`}
        description={toRegen?.has_display_link ? 'El enlace actual dejará de funcionar. La pantalla que lo esté usando mostrará un aviso hasta que abras el nuevo.' : 'Se genera un enlace secreto para abrir la pantalla en el lugar.'}
        footer={<><Button variant="ghost" onClick={() => setToRegen(null)}>Cancelar</Button><Button loading={regen.isPending} onClick={() => toRegen && regen.mutate(toRegen)}>Generar enlace</Button></>}
      >
        <p className="text-sm text-tinta-2">El enlace nuevo se muestra una sola vez. Cópialo y ábrelo en el computador o la tableta del lugar.</p>
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Eliminar ${toDelete?.name ?? ''}`}
        description="Los turnos pasados conservan su registro. No podrás volver a usar este nombre."
        footer={<><Button variant="ghost" onClick={() => setToDelete(null)}>Cancelar</Button><Button variant="danger" loading={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>Eliminar</Button></>}
      >
        <p className="text-sm text-tinta-2">Si solo quieres dejar de usarlo, es mejor desactivarlo.</p>
      </Modal>
    </>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del lugar.').max(120),
  address: z.string().trim().max(255),
})
type Form = z.infer<typeof schema>

function LocationModal({ target, onClose, onCreated }: { target: Location | 'new' | null; onClose: () => void; onCreated: (i: Issued) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const loc = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: { name: loc?.name ?? '', address: loc?.address ?? '' },
  })

  async function onSubmit(v: Form) {
    setFormError(null)
    try {
      if (loc) {
        await api(`/empresa/lugares/${loc.id}`, { method: 'PATCH', body: { name: v.name, address: v.address || null } })
        toast.ok('Lugar actualizado.')
      } else {
        const r = await api<{ location: Location; display_url: string }>('/empresa/lugares', { method: 'POST', body: { name: v.name, address: v.address || null } })
        onCreated({ name: r.location.name, url: r.display_url })
      }
      await qc.invalidateQueries({ queryKey: KEY })
      reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={target !== null} onClose={onClose}
      title={loc ? 'Editar lugar' : 'Nuevo lugar'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-lugar" loading={isSubmitting}>{loc ? 'Guardar cambios' : 'Crear lugar'}</Button></>}
    >
      <form id="form-lugar" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Nombre" placeholder="Bodega Quilicura" error={errors.name?.message} {...register('name')} />
        <TextField label="Dirección" hint="Opcional. La ven los trabajadores en la oferta." error={errors.address?.message} {...register('address')} />
      </form>
    </Modal>
  )
}

function DisplayLinkModal({ issued, onClose }: { issued: Issued | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch { /* el enlace queda visible para copiarlo a mano */ }
  }

  return (
    <Modal
      open={issued !== null} onClose={onClose} wide
      title={`Pantalla de ${issued?.name ?? ''}`}
      description="Este enlace se muestra solo ahora. Cópialo y ábrelo en la pantalla del lugar."
      footer={
        <>
          <a href={issued?.url} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="size-4" aria-hidden /> Abrir pantalla</Button></a>
          <Button onClick={onClose}>Listo, ya lo guardé</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-stretch gap-2">
          <input readOnly value={issued?.url ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de la pantalla"
            className="min-w-0 flex-1 rounded-control border border-linea bg-papel px-3 py-2.5 font-mono text-sm" />
          <Button variant="secondary" onClick={copy}>{copied ? <><Check className="size-4" aria-hidden /> Copiado</> : <><Copy className="size-4" aria-hidden /> Copiar</>}</Button>
        </div>
        <Notice tone="aviso">Quien tenga este enlace puede ver el QR. Compártelo solo con quien deja la pantalla puesta en el lugar. Si se filtra, genera uno nuevo.</Notice>
      </div>
    </Modal>
  )
}
