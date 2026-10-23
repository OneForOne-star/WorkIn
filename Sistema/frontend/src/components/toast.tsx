import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

interface ToastItem { id: number; tone: 'ok' | 'error'; text: string }
interface ToastApi { ok: (text: string) => void; error: (text: string) => void }

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((tone: ToastItem['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((cur) => [...cur, { id, tone, text }])
    window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === 'error' ? 8000 : 5000)
  }, [])

  const api = useMemo<ToastApi>(() => ({ ok: (t) => push('ok', t), error: (t) => push('error', t) }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-control bg-tinta px-4 py-3 text-sm text-crema shadow-lg"
          >
            {t.tone === 'ok'
              ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7fd1a5]" aria-hidden />
              : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ffb59a]" aria-hidden />}
            <span className="flex-1 leading-relaxed">{t.text}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              className="-mr-1 rounded p-0.5 text-crema/70 hover:text-crema"
              onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast fuera de ToastProvider')
  return v
}
