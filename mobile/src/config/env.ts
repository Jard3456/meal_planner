import Constants from 'expo-constants';

function developmentApi() {
  if (!__DEV__) return undefined;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    try {
      const address = new URL(`http://${hostUri}`);
      address.port = '3000';
      address.pathname = '/api';
      return address.toString().replace(/\/+$/, '');
    } catch { /* Usar localhost solo como alternativa de desarrollo. */ }
  }
  return 'http://localhost:3000/api';
}

// Las credenciales MySQL permanecen exclusivamente en backend/.env.
export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || developmentApi(),
};
