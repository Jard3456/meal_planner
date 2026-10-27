import { HttpError } from './errors.js';

export function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'El formulario no es válido.');
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${label}: completa un valor de hasta ${max} caracteres.`);
  return value.trim();
}

export function optionalText(value: unknown, label: string, max: number): string | null {
  if (value == null || value === '') return null;
  return text(value, label, max);
}

export function email(value: unknown) {
  const result = text(value, 'Correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Ingresa un correo válido.');
  return result;
}

export function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 8) throw new HttpError(400, 'Usa una contraseña de al menos 8 caracteres.');
  if (Buffer.byteLength(value, 'utf8') > 72) throw new HttpError(400, 'La contraseña es demasiado larga. Usa una más breve.');
  return value;
}

export function optionalNumber(value: unknown, label: string, maximum: number) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new HttpError(400, `${label}: ingresa un número positivo válido.`);
  }
  return Math.round(value * 100) / 100;
}

export function goal(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !['bajar_peso', 'aumentar_masa_muscular', 'mantener_peso'].includes(value)) {
    throw new HttpError(400, 'Selecciona un objetivo válido.');
  }
  return value;
}
