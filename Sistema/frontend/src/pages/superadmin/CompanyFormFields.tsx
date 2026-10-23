import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { SelectField, TextField } from '../../components/ui'
import { usePlans } from './hooks'

/** Campos de la empresa, comunes al alta y a la edición. `prefix` es "company." en el alta y "" al editar. */
export function CompanyFields({
  register, errors, prefix, withTaxId,
}: {
  register: UseFormRegister<any>
  errors: FieldErrors<any>
  prefix: string
  withTaxId: boolean
}) {
  const plans = usePlans()
  const err = (name: string): string | undefined => {
    const parts = (prefix + name).split('.')
    let cur: any = errors
    for (const p of parts) cur = cur?.[p]
    return cur?.message as string | undefined
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <TextField wrapperClassName="sm:col-span-2" label="Nombre de la empresa" error={err('name')} {...register(`${prefix}name`)} />
      {withTaxId && <TextField label="RUT de la empresa" placeholder="76.123.456-7" error={err('tax_id')} {...register(`${prefix}tax_id`)} />}
      <TextField label="Correo de contacto" type="email" spellCheck={false} error={err('contact_email')} {...register(`${prefix}contact_email`)} />
      <TextField label="Teléfono de contacto" type="tel" placeholder="9 1234 5678" hint="Opcional" error={err('contact_phone')} {...register(`${prefix}contact_phone`)} />
      {plans.data ? (
        <SelectField label="Plan" error={err('plan_id')} {...register(`${prefix}plan_id`)}>
          <option value="">Elige un plan</option>
          {plans.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.max_shifts_per_month === null ? 'turnos sin límite' : `hasta ${p.max_shifts_per_month} turnos al mes`}
            </option>
          ))}
        </SelectField>
      ) : (
        // Hasta que llegan los planes no se dibuja el selector, para que conserve el valor ya elegido.
        <SelectField label="Plan" disabled hint={plans.isError ? 'No pudimos cargar los planes. Cierra y vuelve a abrir.' : undefined}>
          <option>Cargando planes…</option>
        </SelectField>
      )}
      <SelectField label="Ciclo de pago a trabajadores" error={err('payment_cycle')} {...register(`${prefix}payment_cycle`)}>
        <option value="">Elige un ciclo</option>
        <option value="quincenal">Quincenal</option>
        <option value="mensual">Mensual</option>
      </SelectField>
      <TextField label="Suscripción vigente hasta" type="date" hint="Pasados 14 días de esta fecha, la empresa se suspende." error={err('subscription_ends_at')} {...register(`${prefix}subscription_ends_at`)} />
    </div>
  )
}
