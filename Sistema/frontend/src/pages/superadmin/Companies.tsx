import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { addDays, fmtDate, todayLocal } from '../../lib/format'
import { isValidRut, normalizePhone, normalizeRut } from '../../lib/rut'
import type { Company, Paginated } from '../../lib/types'
import { CompanyFields } from './CompanyFormFields'
import { subscriptionState } from './hooks'

export default function Companies() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const q = useQuery({
    queryKey: ['sa', 'companies', { debounced, status, page }],
    queryFn: () => api<Paginated<Company>>('/superadmin/companies', { query: { search: debounced, status, page } }),
    placeholderData: keepPreviousData,
  })

  const rows = q.data?.data ?? []
  const filtering = debounced !== '' || status !== ''

  return (
    <>
      <PageHeader
        title="Empresas"
        subtitle="Cada empresa cliente tiene su propio espacio: trabajadores, turnos y pagos separados de los demás."
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Nueva empresa</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-tinta-3" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o RUT"
            aria-label="Buscar empresa"
            className="h-11 w-full rounded-control border border-linea bg-papel pl-10 pr-3 text-[0.95rem] placeholder:text-tinta-3/70 hover:border-tinta-3/50 focus:border-naranja-fuerte focus:outline-none focus:ring-2 focus:ring-naranja/25"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          aria-label="Filtrar por estado"
          className="h-11 rounded-control border border-linea bg-papel px-3 text-[0.95rem] hover:border-tinta-3/50 focus:border-naranja-fuerte focus:outline-none focus:ring-2 focus:ring-naranja/25"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </div>

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar las empresas.'}</Notice></div>
        ) : rows.length === 0 ? (
          filtering
            ? <EmptyState title="Ninguna empresa coincide">Prueba con otro nombre o quita el filtro de estado.</EmptyState>
            : <EmptyState title="Aún no hay empresas" action={<Button onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Crear la primera empresa</Button>}>
                Al crearla, el dueño recibe un correo para elegir su propia contraseña.
              </EmptyState>
        ) : (
          <>
            <div role="row" className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_1.2fr_5rem] gap-4 border-b border-linea bg-arena/50 px-5 py-2.5 text-[0.8rem] font-medium text-tinta-3 md:grid">
              <span>Empresa</span><span>Plan</span><span>Estado</span><span>Suscripción hasta</span><span className="text-right">Usuarios</span>
            </div>
            <ul className={q.isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
              {rows.map((c) => {
                const st = subscriptionState(c)
                return (
                  <li key={c.id} className="border-b border-linea last:border-b-0">
                    <Link
                      to={`/superadmin/empresas/${c.id}`}
                      className="grid gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-arena/60 md:grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_1.2fr_5rem] md:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block text-sm text-tinta-3">{c.tax_id}</span>
                      </span>
                      <span className="text-sm text-tinta-2">{c.plan?.name ?? '—'}</span>
                      <span><StatusDot tone={st.tone}>{st.label}</StatusDot></span>
                      <span className="text-sm text-tinta-2">{fmtDate(c.subscription_ends_at)}</span>
                      <span className="text-sm text-tinta-2 md:text-right">{c.admins_count ?? 0} <span className="md:hidden">usuarios</span></span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {q.data && q.data.last_page > 1 && (
              <div className="flex items-center justify-between border-t border-linea px-5 py-3 text-sm text-tinta-3">
                <span>{q.data.total} empresas · página {q.data.current_page} de {q.data.last_page}</span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" aria-hidden /></Button>
                  <Button variant="ghost" size="sm" disabled={page >= q.data.last_page} onClick={() => setPage((p) => p + 1)} aria-label="Página siguiente"><ChevronRight className="size-4" aria-hidden /></Button>
                </span>
              </div>
            )}
          </>
        )}
      </Panel>

      <CreateCompanyModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

/* ---------- Alta de empresa + dueño ---------- */

const schema = z.object({
  company: z.object({
    name: z.string().trim().min(2, 'Escribe el nombre de la empresa.').max(120),
    tax_id: z.string().refine(isValidRut, 'El RUT no es válido. Revisa el número y el dígito verificador.'),
    contact_email: z.string().trim().email('Escribe un correo válido.'),
    contact_phone: z.string().refine((v) => v.trim() === '' || normalizePhone(v) !== null, 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
    plan_id: z.string().min(1, 'Elige un plan.'),
    payment_cycle: z.enum(['quincenal', 'mensual'], { error: 'Elige un ciclo de pago.' }),
    subscription_ends_at: z.string().min(1, 'Indica hasta cuándo está vigente.').refine((v) => v >= todayLocal(), 'La fecha no puede ser anterior a hoy.'),
  }),
  owner: z.object({
    rut: z.string().refine(isValidRut, 'El RUT no es válido. Revisa el número y el dígito verificador.'),
    first_name: z.string().trim().min(1, 'Escribe el nombre.').max(80),
    last_name: z.string().trim().min(1, 'Escribe los apellidos.').max(80),
    email: z.string().trim().email('Escribe un correo válido.'),
    phone: z.string().refine((v) => normalizePhone(v) !== null, 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
  }),
})
type Form = z.infer<typeof schema>

function CreateCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { company: { subscription_ends_at: addDays(todayLocal(), 30), payment_cycle: undefined as never } },
  })

  useEffect(() => { if (open) { setFormError(null) } }, [open])

  async function onSubmit(v: Form) {
    setFormError(null)
    try {
      const r = await api<{ company: Company; invitation_sent: boolean; message: string }>('/superadmin/companies', {
        method: 'POST',
        body: {
          company: {
            ...v.company,
            tax_id: normalizeRut(v.company.tax_id),
            plan_id: Number(v.company.plan_id),
            contact_phone: v.company.contact_phone.trim() === '' ? null : normalizePhone(v.company.contact_phone),
          },
          owner: { ...v.owner, rut: normalizeRut(v.owner.rut), phone: normalizePhone(v.owner.phone) },
        },
      })
      await qc.invalidateQueries({ queryKey: ['sa', 'companies'] })
      r.invitation_sent ? toast.ok(r.message) : toast.error(r.message)
      reset()
      onClose()
      navigate(`/superadmin/empresas/${r.company.id}`)
    } catch (e) {
      setFormError(applyServerErrors(e, setError))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Nueva empresa"
      description="Crea la empresa y a su dueño. El dueño recibe un correo para elegir su propia contraseña: nadie más la conoce."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-nueva-empresa" loading={isSubmitting}>Crear empresa y enviar invitación</Button>
        </>
      }
    >
      <form id="form-nueva-empresa" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-7">
        {formError && <Notice tone="error">{formError}</Notice>}
        <fieldset className="space-y-4">
          <legend className="mb-1 text-[0.95rem] font-semibold">Empresa</legend>
          <CompanyFields register={register as never} errors={errors as never} prefix="company." withTaxId />
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-1 text-[0.95rem] font-semibold">Dueño de la cuenta</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="RUT" placeholder="12.345.678-5" error={errors.owner?.rut?.message} {...register('owner.rut')} />
            <TextField label="Celular" type="tel" placeholder="9 1234 5678" error={errors.owner?.phone?.message} {...register('owner.phone')} />
            <TextField label="Nombre" error={errors.owner?.first_name?.message} {...register('owner.first_name')} />
            <TextField label="Apellidos" error={errors.owner?.last_name?.message} {...register('owner.last_name')} />
            <TextField wrapperClassName="sm:col-span-2" label="Correo" type="email" spellCheck={false} hint="Aquí llega el enlace para crear su contraseña." error={errors.owner?.email?.message} {...register('owner.email')} />
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
