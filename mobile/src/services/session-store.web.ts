const key = 'mealplanner.session';

// En web la sesion dura la pestaña actual; las apps nativas usan SecureStore.
export async function readToken() {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
}
export async function writeToken(token: string) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(key, token);
}
export async function deleteToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
}
