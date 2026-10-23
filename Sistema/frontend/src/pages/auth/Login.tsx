import { useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AuthLayout } from '../../components/AuthLayout'
import { Button, Notice, TextField } from '../../components/ui'
import { PasswordField } from '../../components/PasswordField'
import { homeFor, useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../lib/api'

const schema = z.object({
  identifier: z.string().trim().min(1, 'Escribe tu RUT o tu correo.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})
type Form = z.infer<typeof schema>

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [error, setError] = useState<ApiError | null>(null)
  const verified = params.get('verificado')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(values: Form) {
    setError(null)
    try {
      const user = await login(values.identifier, values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/ingresar' ? from : homeFor(user.role), { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'No pudimos iniciar sesión.'))
    }
  }

  return (
    <AuthLayout
      title="Ingresa a WorkIn"
      subtitle="Usa tu RUT o tu correo."
      footer={
        <p>
          ¿Trabajas por día y aún no tienes cuenta?{' '}
          <Link to="/registro" className="font-medium text-naranja-fuerte underline underline-offset-2">Crea tu cuenta</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {verified === '1' && <Notice tone="ok">Correo confirmado. Ya puedes ingresar.</Notice>}
        {verified === '0' && <Notice tone="error">El enlace de confirmación no es válido. Pide uno nuevo desde la pantalla de registro.</Notice>}
        {error && (
          <Notice tone="error">
            {error.message}
            {error.code === 'EMAIL_NOT_VERIFIED' && (
              <> <Link to="/registro/reenviar" className="font-medium underline underline-offset-2">Reenviar correo de confirmación</Link></>
            )}
          </Notice>
        )}

        <TextField
          label="RUT o correo"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="12.345.678-5"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <PasswordField label="Contraseña" autoComplete="current-password" error={errors.password?.message} {...register('password')} />

        <Button type="submit" loading={isSubmitting} className="w-full">Ingresar</Button>
        <p className="text-center text-sm">
          <Link to="/recuperar" className="text-tinta-2 underline underline-offset-2 hover:text-tinta">Olvidé mi contraseña</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
