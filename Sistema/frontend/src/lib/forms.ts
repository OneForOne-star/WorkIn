import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from './api'

/**
 * Muestra bajo cada campo los errores de validación que devuelve el servidor.
 * Devuelve el mensaje general si no hubo errores por campo.
 */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string | null {
  if (!(err instanceof ApiError)) return 'Ocurrió un error inesperado.'
  if (err.errors && Object.keys(err.errors).length > 0) {
    let first = true
    for (const [field, msgs] of Object.entries(err.errors)) {
      setError(field as Path<T>, { type: 'server', message: msgs[0] }, { shouldFocus: first })
      first = false
    }
    return null
  }
  return err.message
}

export const passwordRules = [
  { id: 'len', label: 'Al menos 10 caracteres', test: (v: string) => v.length >= 10 },
  { id: 'let', label: 'Una letra', test: (v: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v) },
  { id: 'num', label: 'Un número', test: (v: string) => /\d/.test(v) },
]
