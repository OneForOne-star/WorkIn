import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Company, PersonRow, Plan } from '../../lib/types'

export function usePlans() {
  return useQuery({
    queryKey: ['sa', 'plans'],
    queryFn: () => api<{ data: Plan[] }>('/superadmin/plans').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export interface CompanyDetail {
  company: Company
  owner: PersonRow | null
  admins_count: number
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['sa', 'company', id],
    queryFn: () => api<CompanyDetail>(`/superadmin/companies/${id}`),
    enabled: !!id,
  })
}

/** Cómo mostrar el estado de una empresa en una frase corta. */
export function subscriptionState(c: Company): { tone: 'ok' | 'aviso' | 'error' | 'idle'; label: string } {
  if (c.status === 'suspended') return { tone: 'error', label: 'Suspendida' }
  if (c.status === 'cancelled') return { tone: 'idle', label: 'Cancelada' }
  if (c.days_left !== null && c.days_left < 0) return { tone: 'aviso', label: 'Vencida, en período de gracia' }
  if (c.days_left !== null && c.days_left <= 7) return { tone: 'aviso', label: `Vence en ${c.days_left} ${c.days_left === 1 ? 'día' : 'días'}` }
  return { tone: 'ok', label: 'Activa' }
}
