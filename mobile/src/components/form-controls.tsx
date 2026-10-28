import { Link } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';

export function FormField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} style={[styles.input, props.multiline && styles.multiline]} placeholderTextColor={palette.muted} /></View>;
}

export function FormButton({ label, onPress, busy = false, disabled = false, secondary = false, danger = false }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, danger && styles.danger, (pressed || busy || disabled) && styles.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? palette.green : '#FFFFFF'} /> : <Text style={[styles.buttonText, secondary && styles.secondaryText, danger && styles.dangerText]}>{label}</Text>}
  </Pressable>;
}

export function FormNotice({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'success' | 'info' }>) {
  return <Text accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, tone === 'success' && styles.success, tone === 'info' && styles.info]}>{children}</Text>;
}

export function ChoiceChips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <View style={styles.chips}>{options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => onChange(option.value)} style={[styles.chip, option.value === value && styles.selected]}><Text style={[styles.chipText, option.value === value && styles.selectedText]}>{option.label}</Text></Pressable>)}</View>;
}

export function AccountGate({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  if (loading) return <ActivityIndicator accessibilityLabel="Cargando tu cuenta" color={palette.green} />;
  if (user) return children;
  return <View style={styles.gate}><Text style={styles.gateTitle}>Inicia sesión para guardar tus datos</Text><Text style={styles.gateBody}>Tus planes, consumos y recetas se guardan en tu cuenta.</Text><Link href="/profile" asChild><Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>Ir a mi perfil</Text></Pressable></Link></View>;
}

const styles = StyleSheet.create({
  field: { gap: 7 }, label: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  input: { color: palette.ink, borderColor: palette.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 50, backgroundColor: palette.background },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  button: { minHeight: 46, backgroundColor: palette.green, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  secondary: { backgroundColor: palette.greenSoft, borderColor: palette.border, borderWidth: 1 },
  danger: { backgroundColor: '#A72E2E' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 }, secondaryText: { color: palette.green }, dangerText: { color: '#FFFFFF' }, pressed: { opacity: 0.68 },
  notice: { color: '#A72E2E', fontSize: 14, lineHeight: 21 }, success: { color: palette.green }, info: { color: palette.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: palette.border }, selected: { backgroundColor: palette.greenSoft, borderColor: palette.green }, chipText: { color: palette.ink, fontSize: 13 }, selectedText: { color: palette.green, fontWeight: '700' },
  gate: { padding: 24, borderRadius: 20, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 }, gateTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' }, gateBody: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
