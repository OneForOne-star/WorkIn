import type { ReactNode } from 'react'
import { Wordmark } from './Brand'

/**
 * Pantallas de acceso: a la izquierda el campo naranja con la idea del producto
 * (solo en pantallas grandes); a la derecha el formulario.
 */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-naranja-fuerte p-12 text-crema lg:flex">
        <div className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-[10px] bg-crema">
            <svg viewBox="0 0 64 64" className="size-6" aria-hidden>
              <path d="M12 20l9 27 11-19 11 19 9-27" fill="none" stroke="#b74719" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          WorkIn
        </div>

        <div>
          <p className="max-w-md text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
            Cuántos días trabajó cada persona, con registro que ambas partes pueden verificar.
          </p>
          <ul className="mt-10 max-w-xs space-y-3 text-[0.95rem] text-crema/90">
            <li className="border-t border-crema/30 pt-3">Convocas turnos y la gente postula</li>
            <li className="border-t border-crema/30 pt-3">Cada persona marca entrada y salida con un QR</li>
            <li className="border-t border-crema/30 pt-3">Al cierre, un resumen para revisar antes de pagar</li>
          </ul>
        </div>

        <p className="text-sm text-crema/75">Gestión de turnos y asistencia para trabajadores por día</p>
      </aside>

      <main className="flex min-h-dvh flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden"><Wordmark /></div>
        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-10">
          <h1 className="text-[1.9rem] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[0.95rem] leading-relaxed text-tinta-3">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-tinta-3">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
