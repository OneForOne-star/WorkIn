import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import jsQR from 'jsqr'
import { Camera, CheckCircle2, RotateCcw } from 'lucide-react'
import { Button, Notice, PageHeader, Panel } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'

interface ScanResult { action: 'check_in' | 'check_out'; message: string; title: string; at: string }

type Phase = 'idle' | 'starting' | 'scanning' | 'sending' | 'done' | 'error'

/**
 * Escáner del QR del lugar. Usa la cámara del celular y envía el código al servidor,
 * que decide si es entrada o salida según la hora y el turno.
 */
export default function Marcar() {
  const qc = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const busyRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const send = useCallback(async (code: string) => {
    if (busyRef.current) return
    busyRef.current = true
    stop()
    setPhase('sending')
    try {
      const r = await api<ScanResult>('/trabajador/asistencia/escanear', { method: 'POST', body: { code } })
      setResult(r)
      setPhase('done')
      void qc.invalidateQueries({ queryKey: ['trab', 'mis-turnos'] })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos registrar tu asistencia. Revisa tu conexión e intenta de nuevo.')
      setPhase('error')
    } finally {
      busyRef.current = false
    }
  }, [qc, stop])

  const tick = useCallback(() => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
      const w = Math.min(640, v.videoWidth)
      const h = Math.round((v.videoHeight / v.videoWidth) * w)
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(v, 0, 0, w, h)
        const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
        if (hit?.data.startsWith('W1.')) { void send(hit.data); return }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [send])

  async function start() {
    setError(null); setResult(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite usar la cámara aquí. Abre WorkIn en Chrome o Safari, o escribe el código a mano abajo.')
      setPhase('error'); return
    }
    setPhase('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) { stop(); return }
      v.srcObject = stream
      await v.play()
      setPhase('scanning')
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      stop()
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setError(denied
        ? 'No tenemos permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio y vuelve a intentar.'
        : 'No pudimos abrir la cámara. Cierra otras apps que la estén usando e intenta de nuevo.')
      setPhase('error')
    }
  }

  function reset() { stop(); setPhase('idle'); setError(null); setResult(null); setManual('') }

  const scanning = phase === 'scanning' || phase === 'starting'

  return (
    <>
      <PageHeader title="Marcar asistencia" subtitle="Escanea el QR de la pantalla del lugar de trabajo. Sirve para la entrada y para la salida." />

      {phase === 'done' && result ? (
        <Panel className="max-w-md p-8 text-center">
          <CheckCircle2 className="mx-auto size-14 text-ok" aria-hidden />
          <p className="mt-4 text-xl font-semibold" role="status">{result.action === 'check_in' ? 'Entrada registrada' : 'Salida registrada'}</p>
          <p className="mt-1 text-tinta-2">{result.title}</p>
          <p className="mt-1 text-sm text-tinta-3">{fmtDateTime(result.at)}</p>
          <p className="mt-4 text-sm text-tinta-2">{result.message}</p>
          <Button variant="secondary" className="mt-6" onClick={reset}>Listo</Button>
        </Panel>
      ) : (
        <div className="max-w-md space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-panel bg-tinta">
            <video ref={videoRef} playsInline muted className={scanning ? 'size-full object-cover' : 'hidden'} />
            {scanning && (
              <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgb(29_33_40/0.45)]" aria-hidden />
            )}
            {!scanning && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-crema/80">
                {phase === 'sending' ? <p>Registrando…</p> : <div><Camera className="mx-auto mb-3 size-10" aria-hidden /><p className="text-sm">La cámara se abre cuando tocas el botón.</p></div>}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          {phase === 'scanning' ? (
            <>
              <p className="text-center text-sm text-tinta-3" role="status">Apunta al código QR de la pantalla.</p>
              <Button variant="secondary" className="w-full" onClick={reset}>Cancelar</Button>
            </>
          ) : phase === 'error' ? (
            <Button className="w-full" onClick={start}><RotateCcw className="size-4" aria-hidden /> Intentar de nuevo</Button>
          ) : (
            <Button className="w-full" loading={phase === 'starting' || phase === 'sending'} onClick={start}><Camera className="size-4" aria-hidden /> Abrir cámara</Button>
          )}

          <details className="rounded-control border border-linea bg-papel px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium text-tinta-2">¿No funciona la cámara?</summary>
            <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) void send(manual.trim()) }}>
              <p className="text-tinta-3">Si puedes ver el código escrito, ingrésalo aquí. Si no, pide al administrador que registre tu asistencia.</p>
              <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="W1.…" aria-label="Código del QR" autoCapitalize="off" spellCheck={false}
                className="h-11 w-full rounded-control border border-linea bg-crema px-3.5 font-mono text-sm focus:border-naranja-fuerte focus:outline-none focus:ring-2 focus:ring-naranja/25" />
              <Button type="submit" variant="secondary" size="sm" disabled={!manual.trim() || phase === 'sending'}>Enviar código</Button>
            </form>
          </details>
        </div>
      )}
    </>
  )
}
