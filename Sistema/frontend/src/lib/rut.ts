/** Deja solo dígitos y K: "18.452.367-k" → "18452367K". */
function clean(value: string): string {
  return value.replace(/[^0-9kK]/g, '').toUpperCase()
}

function dv(body: string): string {
  let sum = 0
  let mul = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const r = 11 - (sum % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

/** "18452367K" → "18452367-K" (o null si no tiene largo de RUT). */
export function normalizeRut(value: string): string | null {
  const c = clean(value)
  if (c.length < 8 || c.length > 9) return null
  return `${c.slice(0, -1)}-${c.slice(-1)}`
}

export function isValidRut(value: string): boolean {
  const n = normalizeRut(value)
  if (!n) return false
  const [body, d] = n.split('-')
  if (!/^\d{7,8}$/.test(body)) return false
  return dv(body) === d
}

/** "18452367-K" → "18.452.367-K". Útil para mostrar. */
export function formatRut(value: string): string {
  const c = clean(value)
  if (c.length < 2) return c
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${body}-${c.slice(-1)}`
}

/** Celular chileno en cualquier formato → "+569XXXXXXXX", o null. */
export function normalizePhone(value: string): string | null {
  const d = value.replace(/\D/g, '')
  if (/^569\d{8}$/.test(d)) return `+${d}`
  if (/^9\d{8}$/.test(d)) return `+56${d}`
  return null
}

export function formatPhone(value: string): string {
  const m = value.match(/^\+56(9)(\d{4})(\d{4})$/)
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : value
}
