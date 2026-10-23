import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { TextField, cx } from './ui'
import { passwordRules } from '../lib/forms'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
  hint?: string
  /** Muestra la lista de requisitos y cuáles ya se cumplen */
  showRules?: boolean
  value?: string
}

export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { showRules, value = '', ...rest }, ref,
) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <TextField
        ref={ref}
        type={visible ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="grid size-9 place-items-center rounded-md text-tinta-3 hover:bg-arena hover:text-tinta"
          >
            {visible ? <EyeOff className="size-[1.1rem]" aria-hidden /> : <Eye className="size-[1.1rem]" aria-hidden />}
          </button>
        }
        {...rest}
      />
      {showRules && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.8rem]" aria-label="Requisitos de la contraseña">
          {passwordRules.map((r) => {
            const ok = r.test(value)
            return (
              <li key={r.id} className={cx('inline-flex items-center gap-1.5', ok ? 'text-ok' : 'text-tinta-3')}>
                <Check className={cx('size-3.5', ok ? 'opacity-100' : 'opacity-30')} aria-hidden />
                {r.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})
