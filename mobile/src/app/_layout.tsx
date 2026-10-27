import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator } from 'react-native';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth-screen';
import { MealScreen } from '@/components/meal-screen';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { palette } from '@/constants/design';

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <MealScreen title="Meal Planner" subtitle="Preparando tu espacio..."><ActivityIndicator accessibilityLabel="Recuperando tu sesión" color={palette.green} /></MealScreen>;
  return user ? <AppTabs /> : <AuthScreen />;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style="dark" />
      <AuthProvider><AppContent /></AuthProvider>
    </ThemeProvider>
  );
}
