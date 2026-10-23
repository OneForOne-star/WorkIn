import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Mail, Pencil, PauseCircle, PlayCircle } from 'lucide-react'
import { Button, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextAreaField, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { addDays, fmtDate, fmtDateTime, todayLocal } from '../../lib/format'
import { formatPhone, normalizePhone } from '../../lib/rut'
import type { Company } from '../../lib/types'
import { CompanyFields } from './CompanyFormFields'
import { subscriptionState, useCompany } from './hooks'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-linea py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-tinta-3">{label}</dt>
      <dd className="min-w-0 break-words text-[0.95rem]">{children}</dd>
    </div>
  )
}

export default function CompanyDetail() {
  const { id } = useParams()
  const q = useCompany(id)
  const qc = useQueryClient()
  const toast = useToast()
  const [modal, setModal] = useState<'edit' | 'suspend' | 'reactivate' | null>(null)
  const [sending, setSending] = useState(false)

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) {
    return (
      <>
        <BackLink />
        <Notice tone="error">{q.error instanceof ApiError && q.error.status === 404 ? 'Esa empresa no existe.' : 'No pudimos cargar la empresa.'}</Notice>
      </>
    )
  }

  const { company: c, owner } = q.data
  const st = subscriptionState(c)

  async function resendInvite() {
    setSending(true)
    try {
      const r = await api<{ message: string }>(`/superadmin/companies/${c.id}/owner/resend-invite`, { method: 'POST' })
      toast.ok(r.message)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No pudimos enviar el correo.')
    } finally { setSending(false) }
  }

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['sa', 'company', id] })
    await qc.invalidateQueries({ queryKey: ['sa', 'companies'] })
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={c.name}
        subtitle={`RUT ${c.tax_id}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('edit')}><Pencil className="size-4" aria-hidden /> Editar</Button>
            {c.status === 'active'
              ? <Button variant="secondary" onClick={() => setModal('suspend')}><PauseCircle className="size-4" aria-hidden /> Suspender</Button>
              : <Button onClick={() => setModal('reactivate')}><PlayCircle className="size-4" aria-hidden /> Reactivar</Button>}
          </>
        }
      />

      {c.status === 'suspended' && (
        <Notice tone="error" className="mb-6">Esta empresa está suspendida: sus usuarios no pueden ingresar. Reactívala cuando regularice su suscripción.</Notice>
      )}
      {c.status === 'active' && st.tone === 'aviso' && (
        <Notice tone="aviso" className="mb-6">
          {c.days_left !== null && c.days_left < 0
            ? <>La suscripción venció el {fmtDate(c.subscription_ends_at)}. Se suspenderá automáticamente el {fmtDate(c.suspends_on)} si no se renueva.</>
            : <>La suscripción vence el {fmtDate(c.subscription_ends_at)}.</>}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-6">
          <h2 className="mb-2 text-base font-semibold">Suscripción</h2>
          <dl>
            <Row label="Estado"><StatusDot tone={st.tone}>{st.label}</StatusDot></Row>
            <Row label="Plan">
              {c.plan?.name ?? '—'}
              {c.plan && <span className="text-tinta-3"> · {c.plan.max_shifts_per_month === null ? 'turnos sin límite' : `hasta ${c.plan.max_shifts_per_month} turnos al mes`}</span>}
            </Row>
            <Row label="Vigente hasta">{fmtDate(c.subscription_ends_at)}</Row>
            <Row label="Se suspende el">{fmtDate(c.suspends_on)} <span className="text-tinta-3">(14 días después)</span></Row>
            <Row label="Ciclo de pago">{c.payment_cycle ? (c.payment_cycle === 'quincenal' ? 'Quincenal' : 'Mensual') : '—'}</Row>
            <Row label="Creada">{fmtDateTime(c.created_at)}</Row>
          </dl>
        </Panel>

        <Panel className="p-6">
          <h2 className="mb-2 text-base font-semibold">Dueño de la cuenta</h2>
          {owner ? (
            <>
              <dl>
                <Row label="Nombre">{owner.first_name} {owner.last_name}</Row>
                <Row label="RUT">{owner.rut}</Row>
                <Row label="Correo">{owner.email}</Row>
                <Row label="Celular">{formatPhone(owner.phone)}</Row>
                <Row label="Cuenta">
                  {owner.activated
                    ? <StatusDot tone="ok">Activada</StatusDot>
                    : <StatusDot tone="aviso">Pendiente: aún no crea su contraseña</StatusDot>}
                </Row>
                <Row label="Último ingreso">{owner.last_login_at ? fmtDateTime(owner.last_login_at) : 'Nunca ha ingresado'}</Row>
              </dl>
              <div className="mt-4">
                <Button variant="secondary" size="sm" loading={sending} onClick={resendInvite}>
                  <Mail className="size-4" aria-hidden /> {owner.activated ? 'Enviar enlace para cambiar contraseña' : 'Reenviar enlace de activación'}
                </Button>
                <p className="mt-2 text-sm text-tinta-3">El enlace dura 3 días. Solo el dueño puede elegir su contraseña.</p>
              </div>
            </>
          ) : <p className="text-sm text-tinta-3">Esta empresa no tiene dueño registrado.</p>}
        </Panel>

        <Panel className="p-6 lg:col-span-2">
          <h2 className="mb-2 text-base font-semibold">Contacto de la empresa</h2>
          <dl className="sm:grid sm:grid-cols-2 sm:gap-x-10">
            <Row label="Correo">{c.contact_email}</Row>
            <Row label="Teléfono">{c.contact_phone ? formatPhone(c.contact_phone) : '—'}</Row>
            <Row label="Usuarios con acceso">{q.data.admins_count} {q.data.admins_count === 1 ? 'administrador' : 'administradores'} además del dueño</Row>
          </dl>
        </Panel>
      </div>

      <EditModal company={c} open={modal === 'edit'} onClose={() => setModal(null)} onSaved={refresh} />
      <SuspendModal company={c} open={modal === 'suspend'} onClose={() => setModal(null)} onSaved={refresh} />
      <ReactivateModal company={c} open={modal === 'reactivate'} onClose={() => setModal(null)} onSaved={refresh} />
    </>
  )
}

function BackLink() {
  return (
    <Link to="/superadmin" className="mb-5 inline-flex items-center gap-1.5 text-sm text-tinta-3 hover:text-tinta">
      <ArrowLeft className="size-4" aria-hidden /> Todas las empresas
    </Link>
  )
}

/* ---------- Editar ---------- */

const editSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la empresa.').max(120),
  contact_email: z.string().trim().email('Escribe un correo válido.'),
  contact_phone: z.string().refine((v) => v.trim() === '' || normalizePhone(v) !== null, 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
  plan_id: z.string().min(1, 'Elige un plan.'),
  payment_cycle: z.enum(['quincenal', 'mensual'], { error: 'Elige un ciclo de pago.' }),
  subscription_ends_at: z.string().min(1, 'Indica hasta cuándo está vigente.'),
})
type EditForm = z.infer<typeof editSchema>

interface ModalProps { company: Company; open: boolean; onClose: () => void; onSaved: () => Promise<void> }

function EditModal({ company, open, onClose, onSaved }: ModalProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: {
      name: company.name,
      contact_email: company.contact_email,
      contact_phone: company.contact_phone ? formatPhone(company.contact_phone) : '',
      plan_id: company.plan ? String(company.plan.id) : '',
      payment_cycle: (company.payment_cycle ?? '') as 'quincenal',
      subscription_ends_at: company.subscription_ends_at ?? '',
    },
  })

  async function onSubmit(v: EditForm) {
    setFormError(null)
    try {
      await api(`/superadmin/companies/${company.id}`, {
        method: 'PATCH',
        body: {
          ...v,
          plan_id: Number(v.plan_id),
          contact_phone: v.contact_phone.trim() === '' ? null : normalizePhone(v.contact_phone),
        },
      })
      await onSaved()
      toast.ok('Cambios guardados.')
      onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={open} onClose={onClose} wide title="Editar empresa"
      description="El RUT de la empresa no se puede cambiar. Para extender la suscripción, cambia la fecha de vigencia."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-editar-empresa" loading={isSubmitting}>Guardar cambios</Button></>}
    >
      <form id="form-editar-empresa" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <CompanyFields register={register as never} errors={errors as never} prefix="" withTaxId={false} />
      </form>
    </Modal>
  )
}

/* ---------- Suspender ---------- */

const suspendSchema = z.object({ reason: z.string().trim().min(3, 'Cuéntanos el motivo (al menos 3 letras).').max(255) })

function SuspendModal({ company, open, onClose, onSaved }: ModalProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof suspendSchema>>({ resolver: zodResolver(suspendSchema) })

  async function onSubmit(v: z.infer<typeof suspendSchema>) {
    setFormError(null)
    try {
      const r = await api<{ message: string }>(`/superadmin/companies/${company.id}/suspend`, { method: 'POST', body: v })
      await onSaved()
      toast.ok(r.message)
      reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={open} onClose={onClose} title={`Suspender ${company.name}`}
      description="Todos sus usuarios pierden la sesión y no podrán ingresar hasta que la reactives. Los datos se conservan."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" type="submit" form="form-suspender" loading={isSubmitting}>Suspender empresa</Button></>}
    >
      <form id="form-suspender" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextAreaField label="Motivo" hint="Queda registrado en el historial de auditoría." error={errors.reason?.message} {...register('reason')} />
      </form>
    </Modal>
  )
}

/* ---------- Reactivar ---------- */

const reactivateSchema = z.object({
  subscription_ends_at: z.string().min(1, 'Indica la nueva fecha de vigencia.').refine((v) => v >= todayLocal(), 'La fecha no puede ser anterior a hoy.'),
})

function ReactivateModal({ company, open, onClose, onSaved }: ModalProps) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof reactivateSchema>>({
    resolver: zodResolver(reactivateSchema),
    defaultValues: { subscription_ends_at: addDays(todayLocal(), 30) },
  })

  async function onSubmit(v: z.infer<typeof reactivateSchema>) {
    setFormError(null)
    try {
      const r = await api<{ message: string }>(`/superadmin/companies/${company.id}/reactivate`, { method: 'POST', body: v })
      await onSaved()
      toast.ok(r.message)
      onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={open} onClose={onClose} title={`Reactivar ${company.name}`}
      description="Sus usuarios podrán ingresar de nuevo. Indica hasta cuándo queda vigente su suscripción."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-reactivar" loading={isSubmitting}>Reactivar empresa</Button></>}
    >
      <form id="form-reactivar" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Suscripción vigente hasta" type="date" error={errors.subscription_ends_at?.message} {...register('subscription_ends_at')} />
      </form>
    </Modal>
  )
}
