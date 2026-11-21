import type { DatosPaciente } from '../db/repo'
import { separarConsulta } from './busqueda'
import { calcularEdad } from './formato'
import { normalizarTelefono } from './normalize'

export interface FormPaciente {
  nombres: string
  apellidoPaterno: string
  apellidoMaterno: string
  fechaNacimiento: string
  celular: string
  comunidad: string
  municipio: string
  curp: string
}

export const FORM_VACIO: FormPaciente = {
  nombres: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  fechaNacimiento: '',
  celular: '',
  comunidad: '',
  municipio: '',
  curp: '',
}

/**
 * Etiquetas y pistas de formato; las usan el alta y la lectura de hojas. `enHoja`:
 * cómo viene impresa la etiqueta en la hoja de papel si no es igual a `etiqueta`.
 */
export const CAMPOS_PACIENTE: Record<
  keyof FormPaciente,
  { etiqueta: string; ayuda?: string; fecha?: true; enHoja?: string[] }
> = {
  nombres: { etiqueta: 'Nombre(s)' },
  apellidoPaterno: { etiqueta: 'Primer apellido' },
  apellidoMaterno: { etiqueta: 'Segundo apellido' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', fecha: true },
  celular: { etiqueta: 'Celular', ayuda: '10 dígitos' },
  comunidad: { etiqueta: 'Comunidad' },
  municipio: { etiqueta: 'Municipio' },
  curp: { etiqueta: 'CURP', ayuda: '18 caracteres' },
}

export type ErroresPaciente = Partial<Record<keyof FormPaciente, string>>

/** 10 dígitos, opcionalmente con lada de país 52 (o 521, formato anterior para celulares). */
const CELULAR = /^(521?)?\d{10}$/
const CURP = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z\d]\d$/

export function validarPaciente(
  f: FormPaciente,
  hoy = new Date(),
): ErroresPaciente {
  const errores: ErroresPaciente = {}
  if (!f.nombres.trim()) errores.nombres = 'Escribe el nombre o nombres.'
  if (!f.apellidoPaterno.trim()) {
    errores.apellidoPaterno = 'Escribe el primer apellido.'
  }
  if (f.fechaNacimiento) {
    const edad = calcularEdad(f.fechaNacimiento, hoy)
    if (edad === undefined) errores.fechaNacimiento = 'Fecha no válida.'
    else if (edad < 0) errores.fechaNacimiento = 'La fecha no puede ser futura.'
    else if (edad > 120) errores.fechaNacimiento = 'Revisa el año.'
  }
  if (f.celular.trim() && !CELULAR.test(f.celular.replace(/\D/g, ''))) {
    errores.celular = 'El celular debe tener 10 dígitos.'
  }
  if (f.curp.trim() && !CURP.test(f.curp.trim().toUpperCase())) {
    errores.curp = 'La CURP tiene 18 caracteres; revisa que esté completa.'
  }
  return errores
}

const opcional = (s: string) => s.trim().replace(/\s+/g, ' ') || undefined

export function aDatosPaciente(f: FormPaciente): DatosPaciente {
  return {
    nombres: f.nombres.trim().replace(/\s+/g, ' '),
    apellidoPaterno: f.apellidoPaterno.trim().replace(/\s+/g, ' '),
    apellidoMaterno: opcional(f.apellidoMaterno),
    fechaNacimiento: opcional(f.fechaNacimiento),
    telefonos: f.celular.trim() ? [normalizarTelefono(f.celular)] : [],
    comunidad: opcional(f.comunidad),
    municipio: opcional(f.municipio),
    curp: opcional(f.curp)?.toUpperCase(),
  }
}

const capitalizar = (p: string) =>
  p.charAt(0).toLocaleUpperCase('es-MX') + p.slice(1)

/**
 * Prellena el alta con lo que se buscó: un celular de 10 dígitos, y el nombre
 * suponiendo el orden habitual "nombres apellido paterno apellido materno".
 */
export function formDesdeBusqueda(consulta: string): FormPaciente {
  const { digitos } = separarConsulta(consulta)
  const palabras = consulta
    .replace(/[\d()+-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(capitalizar)
  const form = { ...FORM_VACIO }
  if (digitos.length === 10) form.celular = digitos
  if (palabras.length === 1) form.nombres = palabras[0]
  else if (palabras.length === 2) {
    ;[form.nombres, form.apellidoPaterno] = palabras
  } else if (palabras.length > 2) {
    form.nombres = palabras.slice(0, -2).join(' ')
    form.apellidoPaterno = palabras[palabras.length - 2]
    form.apellidoMaterno = palabras[palabras.length - 1]
  }
  return form
}
