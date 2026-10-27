import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeScreen } from '@/components/safe-screen';
import { palette } from '@/constants/design';

type Props = PropsWithChildren<{ title: string; subtitle: string }>;

export function MealScreen({ title, subtitle, children }: Props) {
  return (
    <SafeScreen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>Meal Planner</Text>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>MP</Text></View>
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeScreen>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 18, fontWeight: '700', color: palette.green },
  brandMark: { backgroundColor: palette.greenSoft, padding: 10, borderRadius: 14 },
  brandMarkText: { color: palette.green, fontSize: 12, fontWeight: '800' },
  heading: { gap: 10, marginTop: 12 },
  title: { color: palette.ink, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: palette.muted, fontSize: 16, lineHeight: 25 },
  empty: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 24, padding: 28, alignItems: 'center', gap: 14, marginTop: 8 },
  emptyMark: { backgroundColor: palette.greenSoft, width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyMarkText: { fontSize: 28, color: palette.green },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: palette.ink, textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 15, lineHeight: 24, textAlign: 'center', maxWidth: 400 },
});
