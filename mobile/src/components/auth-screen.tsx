import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormButton, FormField, FormNotice } from '@/components/form-controls';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';

export function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [register, setRegister] = useState(false);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    try {
      if (register) await signUp({ nombre, apellido, correo, password });
      else await signIn({ correo, password });
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false); }
  }

  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.cardTitle}>{register ? 'Crea tu cuenta' : 'Te damos la bienvenida'}</Text>
    {register && <><FormField label="Nombre" value={nombre} onChangeText={setNombre} maxLength={100} autoComplete="given-name" editable={!busy} /><FormField label="Apellido (opcional)" value={apellido} onChangeText={setApellido} maxLength={100} autoComplete="family-name" editable={!busy} /></>}
    <FormField label="Correo electrónico" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} />
    <FormField label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType={register ? 'newPassword' : 'password'} maxLength={72} editable={!busy} />
    {register && <Text style={styles.hint}>Utiliza al menos 8 caracteres para tu contraseña.</Text>}
    {!!error && <FormNotice>{error}</FormNotice>}
    <FormButton label={register ? 'Crear cuenta' : 'Iniciar sesión'} onPress={() => { void submit(); }} busy={busy} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setRegister(!register); setError(''); }} style={styles.textButton}><Text style={styles.link}>{register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</Text></Pressable>
  </View>;
}

export function AuthScreen() {
  return <MealScreen title="El punto de partida eres tú." subtitle="Inicia sesión o crea una cuenta para comenzar a organizar tus comidas."><AuthForm /></MealScreen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, padding: 24, borderRadius: 24, gap: 16 },
  cardTitle: { color: palette.ink, fontSize: 23, fontWeight: '700' },
  hint: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  textButton: { alignItems: 'center', padding: 10, minHeight: 44 },
  link: { color: palette.green, fontSize: 15, fontWeight: '600' },
});
