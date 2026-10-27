import * as SecureStore from 'expo-secure-store';

const key = 'mealplanner.session';
export const readToken = () => SecureStore.getItemAsync(key);
export const writeToken = (token: string) => SecureStore.setItemAsync(key, token);
export const deleteToken = () => SecureStore.deleteItemAsync(key);
