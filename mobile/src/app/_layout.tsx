import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/context/auth-context';

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <AuthProvider><AppTabs /></AuthProvider>
    </ThemeProvider>
  );
}
