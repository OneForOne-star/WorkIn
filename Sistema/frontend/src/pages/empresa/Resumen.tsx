import { useQuery } from '@tanstack/react-query'
import { Notice, PageHeader, Panel, Spinner, StatusDot } from '../../components/ui'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import type { Company } from '../../lib/types'
import { subscriptionState } from '../superadmin/hooks'

export function useMyCompany() {
  return useQuery({
    queryKey: ['empresa', 'info'],
    queryFn: () => api<{ company: Company }>('/empresa').then((r) => r.company),
  })
}

export default function Resumen() {
  const { user } = useAuth()
  const q = useMyCompany()

  if (q.isLoading) return <Spinner />
  if (q.isError || !q.data) return <Notice tone="error">{q.error instanceof ApiError ? q.error.message : 'No pudimos cargar tu empresa.'}</Notice>

  const c = q.data
  const st = subscriptionState(c)

  return (
    <>
      <PageHeader title={`Hola, ${user?.first_name}`} subtitle={c.name} />

      {st.tone === 'aviso' && (
        <Notice tone="aviso" className="mb-6">
          {c.days_left !== null && c.days_left < 0
            ? <>Tu suscripción venció el {fmtDate(c.subscription_ends_at)}. Si no se renueva, la cuenta se suspende el {fmtDate(c.suspends_on)}. Escribe al equipo de WorkIn para renovarla.</>
            : <>Tu suscripción vence el {fmtDate(c.subscription_ends_at)}. Escribe al equipo de WorkIn para renovarla.</>}
        </Notice>
      )}

      <Panel className="max-w-2xl p-6">
        <h2 className="mb-1 text-base font-semibold">Tu suscripción</h2>
        <dl>
          {[
            ['Estado', <StatusDot key="s" tone={st.tone}>{st.label}</StatusDot>],
            ['Plan', c.plan ? `${c.plan.name} · ${c.plan.max_shifts_per_month === null ? 'turnos sin límite' : `hasta ${c.plan.max_shifts_per_month} turnos al mes`}` : '—'],
            ['Vigente hasta', fmtDate(c.subscription_ends_at)],
            ['Pago a trabajadores', c.payment_cycle === 'quincenal' ? 'Quincenal' : c.payment_cycle === 'mensual' ? 'Mensual' : '—'],
          ].map(([label, value]) => (
            <div key={String(label)} className="grid gap-1 border-b border-linea py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-sm text-tinta-3">{label}</dt>
              <dd className="text-[0.95rem]">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  )
}
