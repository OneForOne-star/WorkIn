import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, ApiError } from '../../lib/api'
import { LogoMark } from '../../components/Brand'

interface Display {
  location: string
  company: string
  code: string
  expires_in: number
  step: number
}

/**
 * Pantalla del lugar de trabajo: muestra el QR que cambia cada 5 minutos.
 * Se abre con el enlace secreto del lugar, sin iniciar sesión.
 */
export default function Pantalla() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Display | null>(null)
  const [error, setError] = useState<{ fatal: boolean; text: string } | null>(null)
  const [left, setLeft] = useState(0)
  const endsAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    window.clearTimeout(timer.current)
    try {
      const d = await api<Display>(`/pantalla/${encodeURIComponent(token)}`, { auth: false })
      setData(d)
      setError(null)
      endsAt.current = Date.now() + d.expires_in * 1000
      setLeft(d.expires_in)
      // Pide el código nuevo justo después de que cambie.
      timer.current = window.setTimeout(load, d.expires_in * 1000 + 800)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError({ fatal: true, text: 'Este enlace de pantalla no es válido o fue reemplazado. Pide uno nuevo al administrador.' })
        return
      }
      setError({ fatal: false, text: 'Sin conexión. Reintentando…' })
      timer.current = window.setTimeout(load, 8000)
    }
  }, [token])

  useEffect(() => {
    void load()
    return () => window.clearTimeout(timer.current)
  }, [load])

  // Cuenta regresiva visible
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.round((endsAt.current - Date.now()) / 1000))), 500)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => { document.title = data ? `QR · ${data.location}` : 'WorkIn' }, [data])

  if (error?.fatal) {
    return (
      <div className="grid min-h-dvh place-items-center bg-tinta p-8 text-center text-crema">
        <p className="max-w-md text-xl leading-relaxed">{error.text}</p>
      </div>
    )
  }

  const pct = data ? Math.max(0, Math.min(100, (left / data.step) * 100)) : 0
  const mm = String(Math.floor(left / 60)).padStart(1, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between bg-tinta px-6 py-6 text-crema">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <span className="inline-flex items-center gap-2.5 text-lg font-semibold"><LogoMark className="size-8" /> WorkIn</span>
        {data && <span className="text-right text-sm text-crema/70">{data.company}</span>}
      </header>

      <main className="flex flex-col items-center gap-6 py-4 text-center">
        <div>
          <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{data?.location ?? 'Cargando…'}</p>
          <p className="mt-2 text-lg text-crema/75">Escanea este código con WorkIn para marcar tu entrada o tu salida</p>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-2xl" style={{ width: 'min(56vh, 82vw, 34rem)' }}>
          {data ? (
            <QRCodeSVG value={data.code} level="M" marginSize={0} style={{ width: '100%', height: 'auto', display: 'block' }} title="Código QR de asistencia" />
          ) : (
            <div className="aspect-square animate-pulse rounded-xl bg-arena" />
          )}
        </div>

        <div className="w-full max-w-md" aria-live="off">
          <div className="h-1.5 overflow-hidden rounded-full bg-crema/15">
            <div className="h-full rounded-full bg-naranja transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-sm text-crema/70">El código cambia en {mm}:{ss}. Una foto de esta pantalla no sirve para marcar.</p>
          {error && !error.fatal && <p className="mt-2 text-sm text-[#ffb59a]">{error.text}</p>}
        </div>
      </main>

      <footer className="text-sm text-crema/50">Deja esta pantalla encendida en el lugar de trabajo.</footer>
    </div>
  )
}
