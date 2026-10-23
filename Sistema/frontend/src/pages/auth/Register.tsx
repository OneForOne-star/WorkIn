import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '../../components/AuthLayout'
import { Button, CheckField, Notice, TextField } from '../../components/ui'
import { PasswordField } from '../../components/PasswordField'
import { api, ApiError } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'
import { isValidRut, normalizePhone, normalizeRut } from '../../lib/rut'
import { useToast } from '../../components/toast'

const schema = z.object({
  rut: z.string().refine(isValidRut, 'El RUT no es válido. Revisa el número y el dígito verificador.'),
  first_name: z.string().trim().min(1, 'Escribe tu nombre.').max(80),
  last_name: z.string().trim().min(1, 'Escribe tus apellidos.').max(80),
  email: z.string().trim().email('Escribe un correo válido.'),
  phone: z.string().refine((v) => normalizePhone(v) !== null, 'Ingresa un celular chileno, por ejemplo 9 1234 5678.'),
  password: z.string().min(10, 'Usa al menos 10 caracteres.').regex(/[A-Za-z]/, 'Incluye al menos una letra.').regex(/\d/, 'Incluye al menos un número.'),
  password_confirmation: z.string(),
  accept_terms: z.literal(true, { error: 'Debes aceptar los términos para crear tu cuenta.' }),
}).refine((d) => d.password === d.password_confirmation, { path: ['password_confirmation'], message: 'Las contraseñas no coinciden.' })

type Form = z.infer<typeof schema>

export default function Register() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { accept_terms: false as unknown as true },
  })

  async function onSubmit(v: Form) {
    setFormError(null)
    try {
      await api('/auth/register', {
        method: 'POST', auth: false,
        body: {
          rut: normalizeRut(v.rut), first_name: v.first_name, last_name: v.last_name, email: v.email,
          phone: normalizePhone(v.phone), password: v.password, password_confirmation: v.password_confirmation, accept_terms: true,
        },
      })
      setSentTo(v.email)
    } catch (e) {
      setFormError(applyServerErrors(e, setError))
    }
  }

  if (sentTo) return <SentScreen email={sentTo} />

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Regístrate una vez. Después, las empresas que quieran contar contigo te invitan con tu RUT."
      footer={<p>¿Ya tienes cuenta? <Link to="/ingresar" className="font-medium text-naranja-fuerte underline underline-offset-2">Ingresa</Link></p>}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {formError && <Notice tone="error">{formError}</Notice>}
        <TextField label="RUT" placeholder="12.345.678-5" autoComplete="off" inputMode="text" error={errors.rut?.message} {...register('rut')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Nombre" autoComplete="given-name" error={errors.first_name?.message} {...register('first_name')} />
          <TextField label="Apellidos" autoComplete="family-name" error={errors.last_name?.message} {...register('last_name')} />
        </div>
        <TextField label="Correo" type="email" autoComplete="email" spellCheck={false} autoCapitalize="none"
          hint="Aquí te enviamos el enlace de confirmación y las ofertas." error={errors.email?.message} {...register('email')} />
        <TextField label="Celular" type="tel" autoComplete="tel-national" placeholder="9 1234 5678"
          hint="Las empresas lo usan para contactarte si hay un cambio en un turno." error={errors.phone?.message} {...register('phone')} />
        <PasswordField label="Contraseña" autoComplete="new-password" showRules value={watch('password') ?? ''} error={errors.password?.message} {...register('password')} />
        <PasswordField label="Repite la contraseña" autoComplete="new-password" error={errors.password_confirmation?.message} {...register('password_confirmation')} />
        <CheckField
          label="Acepto los términos de uso y que WorkIn trate mis datos personales para gestionar mis turnos, asistencia y pagos."
          error={errors.accept_terms?.message}
          {...register('accept_terms')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">Crear cuenta</Button>
      </form>
    </AuthLayout>
  )
}

function SentScreen({ email }: { email: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function resend() {
    setBusy(true)
    try {
      await api('/auth/email/resend', { method: 'POST', auth: false, body: { email } })
      toast.ok('Te enviamos el correo otra vez.')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No pudimos reenviar el correo.')
    } finally { setBusy(false) }
  }

  return (
    <AuthLayout title="Revisa tu correo">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-naranja-suave text-naranja-fuerte"><MailCheck className="size-5" aria-hidden /></span>
        <p className="text-[0.95rem] leading-relaxed text-tinta-2">
          Te escribimos a <strong className="font-semibold text-tinta">{email}</strong>. Abre el enlace para confirmar tu correo y después ingresa con tu RUT.
          Si no lo ves, revisa la carpeta de spam.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="secondary" loading={busy} onClick={resend}>Reenviar correo</Button>
        <Link to="/ingresar" className="inline-flex h-11 items-center rounded-control px-4 text-[0.95rem] font-medium text-tinta-2 hover:bg-arena">Ir a ingresar</Link>
      </div>
    </AuthLayout>
  )
}

/** Pantalla para pedir el correo de confirmación de nuevo (desde el aviso del login). */
export function ResendVerification() {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    try {
      await api('/auth/email/resend', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase() } })
      setDone(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No pudimos reenviar el correo.')
    } finally { setBusy(false) }
  }

  return (
    <AuthLayout title="Reenviar confirmación" subtitle="Escribe el correo con el que te registraste.">
      {done ? (
        <Notice tone="ok">Si ese correo tiene una cuenta pendiente de confirmar, te enviamos un enlace nuevo.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <TextField label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Button type="submit" loading={busy} className="w-full">Enviar enlace</Button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link to="/ingresar" className="text-tinta-2 underline underline-offset-2">Volver a ingresar</Link></p>
    </AuthLayout>
  )
}
