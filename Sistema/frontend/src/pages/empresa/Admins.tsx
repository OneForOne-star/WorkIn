import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Plus, UserCheck, UserX } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { fmtDateTime } from '../../lib/format'
import { formatPhone, isValidRut, normalizePhone, normalizeRut } from '../../lib/rut'
import type { PersonRow } from '../../lib/types'

const KEY = ['empresa', 'admins']

export default function Admins() {
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [toDeactivate, setToDeactivate] = useState<PersonRow | null>(null)

  const q = useQuery({ queryKey: KEY, queryFn: () => api<{ data: PersonRow[] }>('/empresa/admins').then((r) => r.data) })

  const resend = useMutation({
    mutationFn: (id: number) => api<{ message: string }>(`/empresa/admins/${id}/resend-invite`, { method: 'POST' }),
    onSuccess: (r) => toast.ok(r.message),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos enviar el correo.'),
  })

  const setActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => api(`/empresa/admins/${id}/active`, { method: 'PATCH', body: { is_active } }),
    onSuccess: async (_r, v) => {
      await qc.invalidateQueries({ queryKey: KEY })
      toast.ok(v.is_active ? 'Administrador activado.' : 'Administrador desactivado. Su sesión se cerró.')
      setToDeactivate(null)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No pudimos actualizar al administrador.'),
  })

  const rows = q.data ?? []

  return (
    <>
      <PageHeader
        title="Administradores"
        subtitle="Tienen los mismos accesos que tú: publican turnos, deciden quién trabaja y cierran los pagos. Solo tú puedes crearlos o desactivarlos."
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Nuevo administrador</Button>}
      />

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar los administradores.'}</Notice></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Aún no tienes administradores" action={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Crear el primero</Button>}>
            Cada administrador recibe un correo para elegir su propia contraseña.
          </EmptyState>
        ) : (
          <ul>
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{a.first_name} {a.last_name}</p>
                  <p className="text-sm text-tinta-3">{a.rut} · {a.email} · {formatPhone(a.phone)}</p>
                </div>
                <div className="w-64 text-sm">
                  {!a.is_active
                    ? <StatusDot tone="idle">Desactivado</StatusDot>
                    : a.activated
                      ? <><StatusDot tone="ok">Activo</StatusDot><p className="mt-0.5 pl-4 text-tinta-3">{a.last_login_at ? `Último ingreso ${fmtDateTime(a.last_login_at)}` : 'Aún no ingresa'}</p></>
                      : <StatusDot tone="aviso">Pendiente de crear contraseña</StatusDot>}
                </div>
                <div className="flex gap-2">
                  {a.is_active && !a.activated && (
                    <Button size="sm" variant="secondary" loading={resend.isPending && resend.variables === a.id} onClick={() => resend.mutate(a.id)}>
                      <Mail className="size-4" aria-hidden /> Reenviar enlace
                    </Button>
                  )}
                  {a.is_active
                    ? <Button size="sm" variant="ghost" onClick={() => setToDeactivate(a)}><UserX className="size-4" aria-hidden /> Desactivar</Button>
                    : <Button size="sm" variant="secondary" loading={setActive.isPending && setActive.variables?.id === a.id} onClick={() => setActive.mutate({ id: a.id, is_active: true })}><UserCheck className="size-4" aria-hidden /> Activar</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <CreateAdminModal open={creating} onClose={() => setCreating(false)} />

      <Modal
        open={toDeactivate !== null}
        onClose={() => setToDeactivate(null)}
        title={`Desactivar a ${toDeactivate?.first_name ?? ''} ${toDeactivate?.last_name ?? ''}`}
        description="Se cierra su sesión y no podrá ingresar. Sus registros anteriores se conservan y puedes activarlo de nuevo cuando quieras."
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDeactivate(null)}>Cancelar</Button>
            <Button variant="danger" loading={setActive.isPending} onClick={() => toDeactivate && setActive.mutate({ id: toDeactivate.id, is_active: false })}>Desactivar</Button>
          </>
        }
      >
        <p className="text-sm text-tinta-2">¿Confirmas que quieres desactivar esta cuenta?</p>
      </Modal>
    </>
  )
}

const schema = z.object({
  rut: z.string().refine(isValidRut, 'El RUT no es válido. Revisa el número y el dígito verificador.'),
  first_name: z.string().trim().min(1, 'Escribe el nombre.').max(80),
  last_name: z.string().trim().min(1, 'Escribe los apellidos.').max(80),
  email: z.string().trim().email('Escribe un correo válido.'),
  phone: z.string().refine((v) => normalizePhone(v) !== null, 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
})
type Form = z.infer<typeof schema>

function CreateAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(v: Form) {
    setFormError(null)
    try {
      const r = await api<{ invitation_sent: boolean; message: string }>('/empresa/admins', {
        method: 'POST', body: { ...v, rut: normalizeRut(v.rut), phone: normalizePhone(v.phone) },
      })
      await qc.invalidateQueries({ queryKey: KEY })
      r.invitation_sent ? toast.ok(r.message) : toast.error(r.message)
      reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Nuevo administrador"
      description="Recibirá un correo para elegir su propia contraseña. Tú no la conocerás."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-nuevo-admin" loading={isSubmitting}>Crear y enviar invitación</Button></>}
    >
      <form id="form-nuevo-admin" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="RUT" placeholder="12.345.678-5" error={errors.rut?.message} {...register('rut')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Nombre" error={errors.first_name?.message} {...register('first_name')} />
          <TextField label="Apellidos" error={errors.last_name?.message} {...register('last_name')} />
        </div>
        <TextField label="Correo" type="email" spellCheck={false} error={errors.email?.message} {...register('email')} />
        <TextField label="Celular" type="tel" placeholder="9 1234 5678" error={errors.phone?.message} {...register('phone')} />
      </form>
    </Modal>
  )
}
