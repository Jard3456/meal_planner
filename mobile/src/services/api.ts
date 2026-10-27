import { env } from '@/config/env';

let accessToken: string | undefined;
export function setAccessToken(value: string | undefined) { accessToken = value; }

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: `/${string}`, options: RequestInit = {}, timeoutMs = 12000): Promise<T> {
  if (!env.apiUrl) throw new Error('La aplicación todavía no tiene una dirección de servicio configurada.');
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${env.apiUrl}${path}`, { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message : 'No fue posible completar la operación.';
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error;
    throw new Error('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
