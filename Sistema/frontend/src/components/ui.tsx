import {
  forwardRef, useEffect, useId, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { Loader2 } from 'lucide-react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------- Botones ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-naranja-fuerte text-white hover:bg-naranja-oscuro disabled:bg-naranja-fuerte/50',
  secondary: 'bg-papel text-tinta border border-linea hover:bg-arena disabled:text-tinta-3',
  ghost: 'text-tinta-2 hover:bg-arena disabled:text-tinta-3',
  danger: 'bg-error text-white hover:bg-[#8c1f17] disabled:bg-error/50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'md' | 'sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading, size = 'md', className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed',
        size === 'md' ? 'h-11 px-4 text-[0.95rem]' : 'h-9 px-3 text-sm',
        variants[variant], className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

/* ---------- Campos ---------- */

interface FieldShellProps {
  label: string
  hint?: string
  error?: string
  htmlFor: string
  children: ReactNode
  className?: string
}

export function FieldShell({ label, hint, error, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-tinta">{label}</label>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" className="mt-1.5 text-sm text-error">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="mt-1.5 text-sm text-tinta-3">{hint}</p>
      ) : null}
    </div>
  )
}

const controlClass =
  'block w-full rounded-control border border-linea bg-papel px-3.5 text-[0.95rem] text-tinta placeholder:text-tinta-3/70 ' +
  'transition-colors hover:border-tinta-3/50 focus:border-naranja-fuerte focus:outline-none focus:ring-2 focus:ring-naranja/25 ' +
  'disabled:bg-arena disabled:text-tinta-3'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  wrapperClassName?: string
  trailing?: ReactNode
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, wrapperClassName, trailing, className, id, ...rest }, ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fid}-msg` : undefined}
          className={cx(controlClass, 'h-11', error && 'border-error', trailing ? 'pr-11' : false, className)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
    </FieldShell>
  )
})

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, wrapperClassName, className, id, children, ...rest }, ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid} className={wrapperClassName}>
      <select
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cx(controlClass, 'h-11', error && 'border-error', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
})

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, wrapperClassName, className, id, ...rest }, ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cx(controlClass, 'min-h-24 py-2.5', error && 'border-error', className)}
        {...rest}
      />
    </FieldShell>
  )
})

interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  error?: string
}

export const CheckField = forwardRef<HTMLInputElement, CheckProps>(function CheckField({ label, error, id, ...rest }, ref) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div>
      <label htmlFor={fid} className="flex cursor-pointer items-start gap-3 text-sm text-tinta-2">
        <input ref={ref} id={fid} type="checkbox" className="mt-0.5 size-[1.15rem] shrink-0 accent-naranja-fuerte" {...rest} />
        <span>{label}</span>
      </label>
      {error && <p role="alert" className="mt-1.5 text-sm text-error">{error}</p>}
    </div>
  )
})

/* ---------- Mensajes ---------- */

type Tone = 'info' | 'ok' | 'aviso' | 'error'
const tones: Record<Tone, string> = {
  info: 'bg-arena text-tinta-2',
  ok: 'bg-ok-suave text-ok',
  aviso: 'bg-aviso-suave text-aviso',
  error: 'bg-error-suave text-error',
}

export function Notice({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-control px-4 py-3 text-sm leading-relaxed', tones[tone], className)}>
      {children}
    </div>
  )
}

/** Estado con punto de color: más legible que una etiqueta de fondo en tablas densas. */
export function StatusDot({ tone, children }: { tone: Tone | 'idle'; children: ReactNode }) {
  const dot: Record<string, string> = { ok: 'bg-ok', aviso: 'bg-[#c98a00]', error: 'bg-error', info: 'bg-naranja', idle: 'bg-tinta-3/50' }
  return (
    <span className="inline-flex items-center gap-2 text-sm text-tinta">
      <span className={cx('size-2 rounded-full', dot[tone])} aria-hidden />
      {children}
    </span>
  )
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-tinta-3">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-base font-semibold text-tinta">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-tinta-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ---------- Diálogo ---------- */

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Usa <dialog> nativo: ya trae foco atrapado, Escape y lector de pantalla. */
export function Modal({ open, onClose, title, description, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-panel bg-crema p-0 text-tinta shadow-[0_24px_60px_-12px_rgb(29_33_40/0.45)]',
        wide ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="border-b border-linea px-6 pb-4 pt-5">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-tinta-3">{description}</p>}
        </div>
        <div className="overflow-y-auto px-6 py-5">{open && children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-linea bg-arena/60 px-6 py-4">{footer}</div>}
      </div>
    </dialog>
  )
}

/* ---------- Estructura de página ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-[0.95rem] leading-relaxed text-tinta-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-panel border border-linea bg-papel', className)}>{children}</section>
}
