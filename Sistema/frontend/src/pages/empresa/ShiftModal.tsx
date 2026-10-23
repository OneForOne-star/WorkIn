import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, CheckField, Modal, Notice, SelectField, TextAreaField, TextField } from '../../components/ui'
import { useToast } from '../../components/toast'
import { api } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { fmtDate, fmtMoney, isoToLocalInput } from '../../lib/format'

export interface Shift {
  id: number; title: string; notes: string | null
  location: { id: number; name?: string; address?: string | null }
  starts_at: string; ends_at: string; slots: number; is_night: boolean; is_holiday: boolean
  status: 'draft' | 'published' | 'cancelled' | 'closed'
  rate: { id: number | null; name: string | null; shift_amount: number | null; overtime_hour_amount: number | null }
  low_priority_visible_at: string | null; published_at: string | null; cancellation_reason: string | null
  accepted_count?: number; slots_left?: number; applied_count?: number
}

const dt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const schema = z.object({
  title: z.string().trim().min(2, 'Ponle un título al turno.').max(120),
  location_id: z.string().min(1, 'Elige un lugar.'),
  rate_id: z.string().min(1, 'Elige la tarifa de este turno.'),
  starts_at: z.string().regex(dt, 'Elige fecha y hora de inicio.'),
  ends_at: z.string().regex(dt, 'Elige fecha y hora de término.'),
  slots: z.string().regex(/^\d+$/, 'Escribe cuántas personas necesitas.').refine((v) => Number(v) >= 1 && Number(v) <= 500, 'Entre 1 y 500.'),
  is_night: z.boolean(),
  is_holiday: z.boolean(),
  notes: z.string().trim().max(500),
  low_priority_visible_at: z.string().refine((v) => v === '' || dt.test(v), 'Fecha no válida.'),
})
type Form = z.infer<typeof schema>

export const SHIFT_KEYS = { list: ['empresa', 'turnos'], one: (id: number) => ['empresa', 'turno', id] }

export function ShiftModal({ target, onClose, onSaved }: { target: Shift | 'new' | null; onClose: () => void; onSaved?: (s: Shift) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const publishRef = useRef(true)
  const shift = target && target !== 'new' ? target : null

  const locations = useQuery({
    queryKey: ['empresa', 'lugares'],
    queryFn: () => api<{ data: Array<{ id: number; name: string; is_active: boolean }> }>('/empresa/lugares').then((r) => r.data),
    enabled: target !== null,
  })

  const rates = useQuery({
    queryKey: ['empresa', 'tarifas'],
    queryFn: () => api<{ data: Array<{ id: number; name: string; shift_amount: number; overtime_hour_amount: number; valid_from: string; valid_to: string | null }>; current_id: number | null }>('/empresa/tarifas'),
    enabled: target !== null,
  })

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    values: {
      title: shift?.title ?? '', location_id: shift ? String(shift.location.id) : '',
      rate_id: shift?.rate?.id ? String(shift.rate?.id) : rates.data?.current_id ? String(rates.data.current_id) : '',
      starts_at: isoToLocalInput(shift?.starts_at), ends_at: isoToLocalInput(shift?.ends_at),
      slots: shift ? String(shift.slots) : '1', is_night: shift?.is_night ?? false, is_holiday: shift?.is_holiday ?? false,
      notes: shift?.notes ?? '', low_priority_visible_at: isoToLocalInput(shift?.low_priority_visible_at),
    },
  })

  const usable = (locations.data ?? []).filter((l) => l.is_active || (shift && l.id === shift.location.id))

  async function onSubmit(v: Form) {
    setFormError(null)
    const body = {
      location_id: Number(v.location_id), rate_id: Number(v.rate_id), title: v.title, notes: v.notes || null,
      starts_at: v.starts_at, ends_at: v.ends_at, slots: Number(v.slots),
      is_night: v.is_night, is_holiday: v.is_holiday, low_priority_visible_at: v.low_priority_visible_at || null,
    }
    try {
      const r = shift
        ? await api<{ shift: Shift }>(`/empresa/turnos/${shift.id}`, { method: 'PATCH', body })
        : await api<{ shift: Shift }>('/empresa/turnos', { method: 'POST', body: { ...body, publish: publishRef.current } })
      await qc.invalidateQueries({ queryKey: ['empresa', 'turnos'] })
      await qc.invalidateQueries({ queryKey: ['empresa', 'turno'] })
      toast.ok(shift ? 'Turno actualizado.' : publishRef.current ? 'Turno publicado. Avisamos a tu bolsa.' : 'Borrador guardado.')
      reset(); onClose(); onSaved?.(r.shift)
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  const locked = shift && (shift.accepted_count ?? 0) > 0
  const rateLocked = !!shift && shift.status !== 'draft'
  const rateList = rates.data?.data ?? []

  return (
    <Modal open={target !== null} onClose={onClose} wide
      title={shift ? 'Editar turno' : 'Nuevo turno'}
      description={locked ? 'Ya hay personas aceptadas: no se puede cambiar el horario ni el lugar. Si hace falta, cancela el turno y crea otro.' : 'Las horas son de Chile continental.'}
      footer={
        shift ? (
          <><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" form="form-turno" loading={isSubmitting}>Guardar cambios</Button></>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="form-turno" variant="secondary" disabled={isSubmitting} onClick={() => { publishRef.current = false }}>Guardar borrador</Button>
            <Button type="submit" form="form-turno" loading={isSubmitting} onClick={() => { publishRef.current = true }}>Publicar turno</Button>
          </>
        )
      }>
      <form id="form-turno" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="Título" placeholder="Descarga de camiones" error={errors.title?.message} {...register('title')} />
        <fieldset disabled={!!locked} className="m-0 min-w-0 border-0 p-0">
          <SelectField label="Lugar" error={errors.location_id?.message} {...register('location_id')}>
            <option value="">{locations.isLoading ? 'Cargando…' : usable.length ? 'Elige un lugar' : 'Primero crea un lugar'}</option>
            {usable.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </SelectField>
        </fieldset>
        <fieldset disabled={rateLocked} className="m-0 min-w-0 border-0 p-0">
        <SelectField label="Tarifa" error={errors.rate_id?.message}
          hint={rateLocked ? 'La tarifa quedó fija al publicar. Para usar otra, cancela el turno y crea uno nuevo.' : 'Queda fija en este turno: si cambias la tarifa después, este turno no cambia.'}
          {...register('rate_id')}>
          <option value="">{rates.isLoading ? 'Cargando…' : rateList.length ? 'Elige una tarifa' : 'Primero crea una tarifa'}</option>
          {rateList.map((r) => <option key={r.id} value={r.id}>{r.name} · {fmtMoney(r.shift_amount)} por turno · desde {fmtDate(r.valid_from)}{r.valid_to ? ` hasta ${fmtDate(r.valid_to)}` : ''}</option>)}
          {shift?.rate?.id && !rateList.some((r) => r.id === shift.rate?.id) && <option value={shift.rate?.id}>{shift.rate?.name}</option>}
        </SelectField>
        </fieldset>
        <fieldset disabled={!!locked} className="m-0 min-w-0 border-0 p-0">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Empieza" type="datetime-local" error={errors.starts_at?.message} {...register('starts_at')} />
            <TextField label="Termina" type="datetime-local" error={errors.ends_at?.message} {...register('ends_at')} />
          </div>
        </fieldset>
        <TextField label="Personas que necesitas" inputMode="numeric" wrapperClassName="sm:max-w-48" error={errors.slots?.message} {...register('slots')} />
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <CheckField label="Turno de noche" {...register('is_night')} />
          <CheckField label="Día festivo" {...register('is_holiday')} />
        </div>
        <TextAreaField label="Indicaciones" hint="Opcional. Lo ven los trabajadores: qué llevar, a quién preguntar, etc." error={errors.notes?.message} {...register('notes')} />
        <TextField label="Visible para prioridad baja desde" type="datetime-local"
          hint="Opcional. Quienes tienen prioridad baja verán la oferta recién en este momento; el resto la ve al publicarla." error={errors.low_priority_visible_at?.message} {...register('low_priority_visible_at')} />
      </form>
    </Modal>
  )
}
