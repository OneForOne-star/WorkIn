import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { Button, EmptyState, Modal, Notice, PageHeader, Panel, Spinner, StatusDot, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { fmtDate, fmtMoney, todayLocal } from '../../lib/format'

interface Rate { id: number; name: string; shift_amount: number; overtime_hour_amount: number; valid_from: string; valid_to: string | null }
interface RatesResponse { data: Rate[]; current_id: number | null }

const KEY = ['empresa', 'tarifas']

export default function Tarifas() {
  const [editing, setEditing] = useState<Rate | 'new' | null>(null)
  const q = useQuery({ queryKey: KEY, queryFn: () => api<RatesResponse>('/empresa/tarifas') })
  const rows = q.data?.data ?? []

  return (
    <>
      <PageHeader
        title="Tarifas"
        subtitle="Lo que se paga por turno y por cada hora extra autorizada. Los montos son brutos, en pesos chilenos."
        actions={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Nueva tarifa</Button>}
      />

      <Panel className="overflow-hidden">
        {q.isLoading ? <Spinner /> : q.isError ? (
          <div className="p-6"><Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar las tarifas.'}</Notice></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Aún no tienes tarifas" action={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Crear la primera</Button>}>
            Al crear un turno eliges su tarifa y queda fija en esa oferta, para poder ver siempre cuánto se pagó.
          </EmptyState>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-linea px-5 py-4 last:border-b-0">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-tinta-3">Desde {fmtDate(r.valid_from)}{r.valid_to ? ` hasta ${fmtDate(r.valid_to)}` : ', sin fecha de término'}</p>
                </div>
                <dl className="flex gap-8 text-sm">
                  <div><dt className="text-tinta-3">Por turno</dt><dd className="font-medium">{fmtMoney(r.shift_amount)}</dd></div>
                  <div><dt className="text-tinta-3">Hora extra</dt><dd className="font-medium">{fmtMoney(r.overtime_hour_amount)}</dd></div>
                </dl>
                <div className="w-28 text-sm">{r.id === q.data?.current_id && <StatusDot tone="ok">Vigente</StatusDot>}</div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="size-4" aria-hidden /> Editar</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RateModal target={editing} onClose={() => setEditing(null)} />
    </>
  )
}

const ymd = /^\d{4}-\d{2}-\d{2}$/
const schema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre a la tarifa.').max(80),
  shift_amount: z.string().regex(/^\d+$/, 'Escribe el monto en pesos, solo números.'),
  overtime_hour_amount: z.string().regex(/^\d+$/, 'Escribe el monto en pesos, solo números. Usa 0 si no pagas horas extra.'),
  valid_from: z.string().regex(ymd, 'Elige la fecha de inicio.'),
  valid_to: z.string().refine((v) => v === '' || ymd.test(v), 'Fecha no válida.'),
}).refine((v) => v.valid_to === '' || v.valid_to >= v.valid_from, { path: ['valid_to'], message: 'El término no puede ser antes del inicio.' })
type Form = z.infer<typeof schema>

function RateModal({ target, onClose }: { target: Rate | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const rate = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: {
      name: rate?.name ?? '',
      shift_amount: rate ? String(rate.shift_amount) : '',
      overtime_hour_amount: rate ? String(rate.overtime_hour_amount) : '',
      valid_from: rate?.valid_from ?? todayLocal(),
      valid_to: rate?.valid_to ?? '',
    },
  })

  async function onSubmit(v: Form) {
    setFormError(null)
    try {
      const body = {
        name: v.name, shift_amount: Number(v.shift_amount), overtime_hour_amount: Number(v.overtime_hour_amount),
        valid_from: v.valid_from, valid_to: v.valid_to || null,
      }
      await api(rate ? `/empresa/tarifas/${rate.id}` : '/empresa/tarifas', { method: rate ? 'PATCH' : 'POST', body })
      await qc.invalidateQueries({ queryKey: KEY })
      toast.ok(rate ? 'Tarifa actualizada.' : 'Tarifa creada.')
      reset(); onClose()
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <Modal
      open={target !== null} onClose={onClose}
      title={rate ? 'Editar tarifa' : 'Nueva tarifa'}
      description={rate ? 'Si la tarifa ya está fijada en algún turno, sus montos no se pueden cambiar: crea una nueva y ponle fecha de término a esta.' : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-tarifa" loading={isSubmitting}>{rate ? 'Guardar cambios' : 'Crear tarifa'}</Button></>}
    >
      <form id="form-tarifa" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Nombre" placeholder="Operario de bodega" error={errors.name?.message} {...register('name')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Pago por turno" inputMode="numeric" placeholder="35000" error={errors.shift_amount?.message} {...register('shift_amount')} />
          <TextField label="Pago por hora extra" inputMode="numeric" placeholder="5000" error={errors.overtime_hour_amount?.message} {...register('overtime_hour_amount')} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Vigente desde" type="date" error={errors.valid_from?.message} {...register('valid_from')} />
          <TextField label="Vigente hasta" type="date" hint="Déjalo vacío si no termina." error={errors.valid_to?.message} {...register('valid_to')} />
        </div>
      </form>
    </Modal>
  )
}
