import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import type { FoodGoal, UserProfile } from '@/types/meal-planner';

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} style={styles.input} placeholderTextColor={palette.muted} /></View>;
}

function Action({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonLabel}>{label}</Text>}
  </Pressable>;
}

function SignInForm() {
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
    {register && <><Field label="Nombre" value={nombre} onChangeText={setNombre} maxLength={100} autoComplete="given-name" editable={!busy} /><Field label="Apellido (opcional)" value={apellido} onChangeText={setApellido} maxLength={100} autoComplete="family-name" editable={!busy} /></>}
    <Field label="Correo electrónico" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} />
    <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType={register ? 'newPassword' : 'password'} maxLength={72} editable={!busy} />
    {register && <Text style={styles.hint}>Utiliza al menos 8 caracteres para tu contraseña.</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Action label={register ? 'Crear cuenta' : 'Iniciar sesión'} busy={busy} onPress={() => { void submit(); }} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setRegister(!register); setError(''); }} style={styles.textButton}><Text style={styles.link}>{register ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</Text></Pressable>
  </View>;
}

const goals: { value: FoodGoal | null; label: string }[] = [
  { value: null, label: 'Por definir' },
  { value: 'bajar_peso', label: 'Bajar de peso' },
  { value: 'aumentar_masa_muscular', label: 'Aumentar masa muscular' },
  { value: 'mantener_peso', label: 'Mantener mi peso' },
];

function ProfileEditor({ user }: { user: UserProfile }) {
  const { updateProfile, signOut } = useAuth();
  const [nombre, setNombre] = useState(user.nombre);
  const [apellido, setApellido] = useState(user.apellido ?? '');
  const [objetivo, setObjetivo] = useState(user.objetivo);
  const [peso, setPeso] = useState(user.peso_actual?.toString() ?? '');
  const [estatura, setEstatura] = useState(user.estatura?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const toNumber = (value: string) => value.trim() ? Number(value.trim().replace(',', '.')) : null;

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      const weight = toNumber(peso); const height = toNumber(estatura);
      if ((weight != null && !Number.isFinite(weight)) || (height != null && !Number.isFinite(height))) throw new Error('Revisa el peso y la estatura.');
      await updateProfile({ nombre, apellido: apellido || null, objetivo, peso_actual: weight, estatura: height });
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await signOut(); } catch { setError('No se pudo cerrar la sesión. Intenta de nuevo.'); }
    finally { setBusy(false); }
  }

  return <View style={styles.card}>
    <Text style={styles.cardTitle}>Hola, {user.nombre}</Text>
    <Text style={styles.hint}>{user.correo}</Text>
    <Field label="Nombre" value={nombre} onChangeText={value => { setNombre(value); setSaved(false); }} maxLength={100} editable={!busy} />
    <Field label="Apellido" value={apellido} onChangeText={value => { setApellido(value); setSaved(false); }} maxLength={100} editable={!busy} />
    <Text style={styles.label}>Mi objetivo alimenticio</Text>
    <View style={styles.goals}>
      {goals.map(goal => <Pressable key={goal.label} accessibilityRole="radio" accessibilityState={{ checked: objetivo === goal.value, disabled: busy }} disabled={busy} onPress={() => { setObjetivo(goal.value); setSaved(false); }} style={[styles.chip, objetivo === goal.value && styles.selected]}><Text style={styles.chipText}>{goal.label}</Text></Pressable>)}
    </View>
    <Field label="Peso actual (kg, opcional)" value={peso} onChangeText={value => { setPeso(value); setSaved(false); }} keyboardType="decimal-pad" editable={!busy} />
    <Field label="Estatura (cm, opcional)" value={estatura} onChangeText={value => { setEstatura(value); setSaved(false); }} keyboardType="decimal-pad" editable={!busy} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {saved && <Text accessibilityLiveRegion="polite" style={styles.success}>Tu perfil se guardó correctamente.</Text>}
    <Action label="Guardar perfil" busy={busy} onPress={() => { void save(); }} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void logout(); }} style={styles.textButton}><Text style={styles.link}>Cerrar sesión</Text></Pressable>
  </View>;
}

export default function ProfileScreen() {
  const { user, loading } = useAuth();
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <MealScreen title="El punto de partida eres tú." subtitle="Tu cuenta, tu perfil y tus objetivos alimenticios.">
      {loading ? <ActivityIndicator accessibilityLabel="Recuperando tu sesión" color={palette.green} /> : user ? <ProfileEditor key={user.id_usuario} user={user} /> : <SignInForm />}
    </MealScreen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, padding: 24, borderRadius: 24, gap: 16 },
  cardTitle: { color: palette.ink, fontSize: 23, fontWeight: '700' },
  field: { gap: 7 }, label: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  input: { color: palette.ink, borderColor: palette.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 50, backgroundColor: palette.background },
  hint: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 50, backgroundColor: palette.green, borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  textButton: { alignItems: 'center', padding: 10, minHeight: 44 }, link: { color: palette.green, fontSize: 15, fontWeight: '600' },
  error: { color: '#A72E2E', fontSize: 14, lineHeight: 21 }, success: { color: palette.green, fontSize: 14 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 12, padding: 12, borderColor: palette.border, borderWidth: 1 },
  selected: { backgroundColor: palette.greenSoft, borderColor: palette.green },
  chipText: { color: palette.ink, fontSize: 13 },
});
