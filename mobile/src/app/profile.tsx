import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { MealScreen } from '@/components/meal-screen';
import { AuthForm } from '@/components/auth-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import type { ActivityLevel, BiologicalSex, FoodGoal, UserProfile } from '@/types/meal-planner';

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} style={styles.input} placeholderTextColor={palette.muted} /></View>;
}

function Action({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.6 }]}>
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonLabel}>{label}</Text>}
  </Pressable>;
}

const goals: { value: FoodGoal | null; label: string }[] = [
  { value: null, label: 'Por definir' },
  { value: 'bajar_peso', label: 'Bajar de peso' },
  { value: 'aumentar_masa_muscular', label: 'Aumentar masa muscular' },
  { value: 'mantener_peso', label: 'Mantener mi peso' },
];
const activities: { value: ActivityLevel; label: string; detail: string }[] = [
  { value: 'inactivo', label: 'Inactivo', detail: 'Poco o ningún ejercicio' },
  { value: 'bajo', label: 'Bajo', detail: 'Actividad ligera' },
  { value: 'activo', label: 'Activo', detail: 'Ejercicio regular' },
  { value: 'muy_activo', label: 'Muy activo', detail: 'Entrenamiento intenso' },
];

function ProfileEditor({ user }: { user: UserProfile }) {
  const { updateProfile, signOut } = useAuth();
  const [nombre, setNombre] = useState(user.nombre);
  const [apellido, setApellido] = useState(user.apellido ?? '');
  const [objetivo, setObjetivo] = useState(user.objetivo);
  const [peso, setPeso] = useState(user.peso_actual?.toString() ?? '');
  const [estatura, setEstatura] = useState(user.estatura?.toString() ?? '');
  const [edad, setEdad] = useState(user.edad?.toString() ?? '');
  const [sexo, setSexo] = useState<BiologicalSex | null>(user.sexo);
  const [actividad, setActividad] = useState<ActivityLevel | null>(user.nivel_actividad);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const toNumber = (value: string) => value.trim() ? Number(value.trim().replace(',', '.')) : null;

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      const weight = toNumber(peso); const height = toNumber(estatura);
      if ((weight != null && !Number.isFinite(weight)) || (height != null && !Number.isFinite(height))) throw new Error('Revisa el peso y la estatura.');
      const age = edad.trim() ? Number(edad.trim()) : null;
      if (age != null && (!Number.isInteger(age) || age < 19 || age > 120)) throw new Error('La edad debe ser un número entero entre 19 y 120.');
      await updateProfile({ nombre, apellido: apellido || null, objetivo, peso_actual: weight, estatura: height, edad: age, sexo, nivel_actividad: actividad });
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
    <Field label="Edad (años, 19 o más)" value={edad} onChangeText={value => { setEdad(value); setSaved(false); }} keyboardType="number-pad" editable={!busy} />
    <Text style={styles.label}>Sexo usado para estimar calorías</Text>
    <Text style={styles.hint}>La ecuación de referencia ofrece opciones femenino y masculino.</Text>
    <View style={styles.goals}>
      {([{ value: 'femenino', label: 'Femenino' }, { value: 'masculino', label: 'Masculino' }] as const).map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: sexo === option.value, disabled: busy }} disabled={busy} onPress={() => { setSexo(option.value); setSaved(false); }} style={[styles.chip, sexo === option.value && styles.selected]}><Text style={styles.chipText}>{option.label}</Text></Pressable>)}
    </View>
    <Text style={styles.label}>Nivel de actividad física</Text>
    <View style={styles.activityList}>
      {activities.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: actividad === option.value, disabled: busy }} disabled={busy} onPress={() => { setActividad(option.value); setSaved(false); }} style={[styles.activityOption, actividad === option.value && styles.selected]}><Text style={styles.chipText}>{option.label}</Text><Text style={styles.hint}>{option.detail}</Text></Pressable>)}
    </View>
    <Text style={styles.hint}>La estimación es orientativa para adultos; no aplica durante embarazo o lactancia.</Text>
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
      {loading ? <ActivityIndicator accessibilityLabel="Recuperando tu sesión" color={palette.green} /> : user ? <ProfileEditor key={user.id_usuario} user={user} /> : <AuthForm />}
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
  activityList: { gap: 8 },
  activityOption: { borderRadius: 12, padding: 12, borderColor: palette.border, borderWidth: 1, gap: 5 },
});
