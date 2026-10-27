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
  const multipartUpload = path === '/foods/scan-label';
  const headers: HeadersInit = multipartUpload
    ? { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }
    : (() => {
      const value = new Headers(options.headers);
      value.set('Accept', 'application/json');
      if (accessToken) value.set('Authorization', `Bearer ${accessToken}`);
      if (options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData) && !value.has('Content-Type')) value.set('Content-Type', 'application/json');
      return value;
    })();
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
    if (controller.signal.aborted) throw new Error(path === '/foods/scan-label'
      ? 'La lectura de la foto tardó demasiado. Intenta de nuevo con una foto más pequeña y nítida.'
      : 'La solicitud tardó demasiado. Intenta de nuevo.');
    if (multipartUpload) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Falló el envío de la foto (${detail}). Comprueba que el teléfono y la computadora estén en la misma red Wi-Fi.`);
    }
    throw new Error('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
