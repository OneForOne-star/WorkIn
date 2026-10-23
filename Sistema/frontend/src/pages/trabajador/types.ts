export interface MyShift {
  id: number
  status: 'applied' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled' | 'no_show'
  shift_status: 'draft' | 'published' | 'cancelled' | 'closed'
  company: string
  title: string
  location: { name: string; address: string | null }
  starts_at: string
  ends_at: string
  is_night: boolean
  is_holiday: boolean
  pay: { shift_amount: number | null; overtime_hour_amount: number | null }
  check_in_at: string | null
  check_out_at: string | null
  overtime: { authorized_hours: number; can_request: boolean; request: { id: number; hours: number; reason: string; status: 'pending' | 'approved' | 'rejected'; resolution_comment: string | null } | null }
  windows: { check_in_opens_at: string; check_in_closes_at: string; check_out_opens_at: string; check_out_closes_at: string }
}
