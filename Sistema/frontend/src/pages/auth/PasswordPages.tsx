import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '../../components/AuthLayout'
import { Button, CheckField, Notice, TextField } from '../../components/ui'
import { PasswordField } from '../../components/PasswordField'
import { api } from '../../lib/api'
import { applyServerErrors } from '../../lib/forms'

const passwordSchema = z.string()
  .min(10, 'Usa al menos 10 caracteres.')
  .regex(/[A-Za-z]/, 'Incluye al menos una letra.')
  .regex(/\d/, 'Incluye al menos un número.')

/* ---------- Pedir enlace ---------- */

const forgotSchema = z.object({ email: z.string().trim().email('Escribe un correo válido.') })

export function ForgotPassword() {
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  async function onSubmit(v: z.infer<typeof forgotSchema>) {
    setFormError(null)
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email: v.email.toLowerCase() } })
      setDone(true)
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <AuthLayout title="Recupera tu contraseña" subtitle="Te enviamos un enlace para crear una nueva.">
      {done ? (
        <Notice tone="ok">Si ese correo está registrado, te enviamos un enlace para crear una nueva contraseña. Vence en 60 minutos.</Notice>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {formError && <Notice tone="error">{formError}</Notice>}
          <TextField label="Correo" type="email" autoComplete="email" spellCheck={false} error={errors.email?.message} {...register('email')} />
          <Button type="submit" loading={isSubmitting} className="w-full">Enviar enlace</Button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link to="/ingresar" className="text-tinta-2 underline underline-offset-2">Volver a ingresar</Link></p>
    </AuthLayout>
  )
}

/* ---------- Crear la contraseña con el enlace del correo ---------- */

const newPassSchema = z.object({
  password: passwordSchema,
  password_confirmation: z.string(),
}).refine((d) => d.password === d.password_confirmation, { path: ['password_confirmation'], message: 'Las contraseñas no coinciden.' })

const invitationSchema = z.object({
  password: passwordSchema,
  password_confirmation: z.string(),
  accept_terms: z.literal(true, { error: 'Debes aceptar los términos para activar tu cuenta.' }),
}).refine((d) => d.password === d.password_confirmation, { path: ['password_confirmation'], message: 'Las contraseñas no coinciden.' })

function DoneNotice({ text }: { text: string }) {
  return (
    <div className="space-y-6">
      <Notice tone="ok">{text}</Notice>
      <Link to="/ingresar" className="inline-flex h-11 w-full items-center justify-center rounded-control bg-naranja-fuerte font-medium text-white hover:bg-naranja-oscuro">Ir a ingresar</Link>
    </div>
  )
}

function BrokenLink() {
  return (
    <AuthLayout title="Este enlace no es válido">
      <p className="text-[0.95rem] leading-relaxed text-tinta-2">Falta información en el enlace. Abre de nuevo el correo y usa el botón completo, o pide que te envíen uno nuevo.</p>
      <p className="mt-6 text-sm"><Link to="/ingresar" className="text-tinta-2 underline underline-offset-2">Volver a ingresar</Link></p>
    </AuthLayout>
  )
}

/** /restablecer?token=…&email=… */
export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const email = params.get('email')
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof newPassSchema>>({ resolver: zodResolver(newPassSchema) })

  if (!token || !email) return <BrokenLink />

  async function onSubmit(v: z.infer<typeof newPassSchema>) {
    setFormError(null)
    try {
      await api('/auth/reset-password', { method: 'POST', auth: false, body: { token, email, password: v.password, password_confirmation: v.password_confirmation } })
      setDone(true)
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <AuthLayout title="Crea una nueva contraseña" subtitle={`Para la cuenta ${email}`}>
      {done ? <DoneNotice text="Contraseña actualizada. Ya puedes ingresar." /> : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {formError && <Notice tone="error">{formError} <Link to="/recuperar" className="font-medium underline underline-offset-2">Pedir otro enlace</Link></Notice>}
          <PasswordField label="Nueva contraseña" autoComplete="new-password" showRules value={watch('password') ?? ''} error={errors.password?.message} {...register('password')} />
          <PasswordField label="Repite la contraseña" autoComplete="new-password" error={errors.password_confirmation?.message} {...register('password_confirmation')} />
          <Button type="submit" loading={isSubmitting} className="w-full">Guardar contraseña</Button>
        </form>
      )}
    </AuthLayout>
  )
}

/** /crear-contrasena?token=…&email=… (dueños y administradores invitados) */
export function CreatePassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const email = params.get('email')
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof invitationSchema>>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { accept_terms: false as unknown as true },
  })

  if (!token || !email) return <BrokenLink />

  async function onSubmit(v: z.infer<typeof invitationSchema>) {
    setFormError(null)
    try {
      await api('/auth/invitation/accept', {
        method: 'POST', auth: false,
        body: { token, email, password: v.password, password_confirmation: v.password_confirmation, accept_terms: true },
      })
      setDone(true)
    } catch (e) { setFormError(applyServerErrors(e, setError)) }
  }

  return (
    <AuthLayout title="Activa tu cuenta" subtitle={`Crea tu contraseña para ${email}. Solo tú la conocerás.`}>
      {done ? <DoneNotice text="Contraseña creada. Ya puedes ingresar con tu RUT." /> : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {formError && <Notice tone="error">{formError}</Notice>}
          <PasswordField label="Contraseña" autoComplete="new-password" showRules value={watch('password') ?? ''} error={errors.password?.message} {...register('password')} />
          <PasswordField label="Repite la contraseña" autoComplete="new-password" error={errors.password_confirmation?.message} {...register('password_confirmation')} />
          <CheckField
            label="Acepto los términos de uso y el tratamiento de datos personales de WorkIn."
            error={errors.accept_terms?.message}
            {...register('accept_terms')}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">Activar cuenta</Button>
        </form>
      )}
    </AuthLayout>
  )
}
