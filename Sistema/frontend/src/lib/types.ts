export type Role = 'super_admin' | 'admin' | 'company_owner' | 'trabajador'

export interface User {
  id: number
  role: Role
  company_id: number | null
  company: { id: number; name: string | null } | null
  rut: string
  first_name: string
  last_name: string
  email: string
  phone: string
}

export interface Plan {
  id: number
  name: string
  max_shifts_per_month: number | null
  price_monthly: number | null
}

export type CompanyStatus = 'active' | 'suspended' | 'cancelled'

export interface Company {
  id: number
  name: string
  tax_id: string
  contact_email: string
  contact_phone: string | null
  plan: { id: number; name: string; max_shifts_per_month: number | null } | null
  status: CompanyStatus
  payment_cycle: 'quincenal' | 'mensual' | null
  subscription_ends_at: string | null
  days_left: number | null
  suspends_on: string | null
  created_at: string | null
  admins_count?: number
}

export interface PersonRow {
  id: number
  rut: string
  first_name: string
  last_name: string
  email: string
  phone: string
  is_active: boolean
  activated: boolean
  last_login_at: string | null
}

export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
  per_page: number
}
