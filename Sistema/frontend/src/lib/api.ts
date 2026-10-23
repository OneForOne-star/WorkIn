const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://api-workin.otecnya.cl/api/v1'
const TOKEN_KEY = 'workin.token'

export class ApiError extends Error {
  status: number
  code?: string
  errors?: Record<string, string[]>
  constructor(status: number, message: string, code?: string, errors?: Record<string, string[]>) {
    super(message)
    this.status = status
    this.code = code
    this.errors = errors
  }
}

/** El token vive en localStorage; si el navegador lo bloquea, la sesión dura mientras la pestaña esté abierta. */
let memoryToken: string | null = null
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? memoryToken
    } catch {
      return memoryToken
    }
  },
  set(t: string) {
    memoryToken = t
    try {
      localStorage.setItem(TOKEN_KEY, t)
    } catch {
      /* sin almacenamiento: queda en memoria */
    }
  },
  clear() {
    memoryToken = null
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* nada */
    }
  },
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined | null>
  /** false para rutas públicas: no envía token ni cierra sesión ante un 401 */
  auth?: boolean
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = opts
  const url = new URL(BASE + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? tokenStore.get() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 'NETWORK')
  }

  if (res.status === 204) return undefined as T

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* respuesta sin JSON */
  }

  if (!res.ok) {
    if (res.status === 401 && auth && token) {
      tokenStore.clear()
      onUnauthorized?.()
    }
    const message =
      data?.message && typeof data.message === 'string'
        ? data.message
        : res.status >= 500
          ? 'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en unos minutos.'
          : 'No pudimos completar la acción.'
    throw new ApiError(res.status, message, data?.code, data?.errors)
  }

  return data as T
}

/** Descarga un archivo que exige sesión (el navegador no puede mandar el token en un enlace simple). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = tokenStore.get()
  let res: Response
  try {
    res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', 'NETWORK')
  }
  if (!res.ok) throw new ApiError(res.status, 'No pudimos descargar el archivo.')
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
