import { Circle, Svg } from 'react-native-svg';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { palette } from '@/constants/design';
import { estimateDailyCalories, estimateMacroTargets, type MacroRange } from '@/utils/calorie-estimate';
import type { UserProfile } from '@/types/meal-planner';

type MacroKey = 'proteinas' | 'carbohidratos' | 'grasas';
type MacroTotals = Record<MacroKey, number>;

function MacroMeter({ label, intake, target }: { label: string; intake: number; target: MacroRange }) {
  const actual = Math.max(0, intake);
  const max = Math.max(1, target.maximum);
  const fill = Math.min(100, actual / max * 100);
  const minimumMark = Math.min(100, target.minimum / max * 100);
  const color = actual > target.maximum ? '#A72E2E' : actual >= target.minimum ? palette.green : '#C58A2B';
  return <View style={styles.macroItem}>
    <View style={styles.macroHeading}><Text style={styles.macroName}>{label}</Text><Text style={styles.macroIntake}>{Math.round(actual)} g</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel={`${label}: ${Math.round(actual)} gramos. Rango de referencia ${target.minimum} a ${target.maximum} gramos.`} accessibilityValue={{ min: 0, max: target.maximum, now: Math.min(target.maximum, actual) }} style={styles.macroTrack}>
      <View style={[styles.macroFill, { width: `${fill}%`, backgroundColor: color }]} />
      <View style={[styles.macroMinimumMarker, { left: `${minimumMark}%` }]} />
    </View>
    <Text style={styles.macroTarget}>{`Rango gu\u00eda: ${target.minimum}\u2013${target.maximum} g`}</Text>
  </View>;
}

function percentageRemaining(consumed: number, target: number) {
  return Math.max(0, Math.ceil(((target - consumed) / target) * 100));
}

export function CalorieGoalChart({ user, calories, macros, macrosIncomplete = 0 }: { user: UserProfile; calories: number; macros: MacroTotals; macrosIncomplete?: number }) {
  const range = estimateDailyCalories(user);
  if (!range) {
    return <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>{'\u2726'}</Text></View>
      <Text style={styles.emptyTitle}>Completa tu perfil</Text>
      <Text style={styles.emptyDescription}>Agrega tus datos y objetivo para descubrir tu rango diario.</Text>
      <Link href="/profile" asChild><Pressable accessibilityRole="button" style={styles.profileLink}><Text style={styles.profileLinkText}>Editar mi perfil {'\u2192'}</Text></Pressable></Link>
    </View>;
  }

  const consumed = Math.max(0, calories);
  const progress = Math.min(1, consumed / range.maximum);
  const radius = 93;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  const remainingMax = Math.max(0, range.maximum - consumed);
  const overMax = consumed > range.maximum;
  const macroTargets = estimateMacroTargets(range);

  return <View style={styles.widget}>
    <View style={styles.card}>
    <View pointerEvents="none" style={styles.glowOne} /><View pointerEvents="none" style={styles.glowTwo} />
    <View style={styles.chartWrap} accessibilityRole="image" accessibilityLabel={`${consumed} kilocalor\u00edas consumidas. Rango diario estimado de ${range.minimum} a ${range.maximum} kilocalor\u00edas.`}>
      <Svg width={224} height={224} viewBox="0 0 224 224" style={styles.chart}>
        <Circle cx="112" cy="112" r={radius} stroke="#527863" strokeWidth={17} fill="none" />
        <Circle cx="112" cy="112" r={radius} stroke={palette.amber} strokeWidth={17} fill="none" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={strokeDashoffset} strokeLinecap="round" rotation="-90" origin="112, 112" />
      </Svg>
      <View style={styles.chartCenter}>
        <Text style={styles.consumed}>{consumed.toLocaleString('es-GT')}</Text>
        <Text style={styles.unit}>KCAL CONSUMIDAS</Text>
      </View>
    </View>
    <View style={styles.range}>
      <View style={styles.targetBox}><Text style={styles.targetLabel}>{'M\u00cdNIMO'}</Text><Text style={styles.targetValue}>{range.minimum.toLocaleString('es-GT')} <Text style={styles.kcal}>kcal</Text></Text><Text style={styles.percent}>{consumed >= range.minimum ? '0% restante' : `${percentageRemaining(consumed, range.minimum)}% restante`}</Text></View>
      <View style={styles.targetBox}><Text style={styles.targetLabel}>{'M\u00c1XIMO'}</Text><Text style={styles.targetValue}>{range.maximum.toLocaleString('es-GT')} <Text style={styles.kcal}>kcal</Text></Text><Text style={styles.percent}>{overMax ? `${Math.round((consumed / range.maximum - 1) * 100)}% sobre` : `${percentageRemaining(consumed, range.maximum)}% restante`}</Text></View>
    </View>
    <Text style={styles.footnote}>{overMax ? 'Ya superaste tu rango estimado.' : `${remainingMax.toLocaleString('es-GT')} kcal para alcanzar el m\u00e1ximo estimado.`}{' Estimaci\u00f3n seg\u00fan tu objetivo.'}</Text>
    </View>
    {macroTargets && <View style={styles.macroCard}>
      <View style={styles.macroTitleRow}><Text style={styles.macroTitle}>Macronutrientes</Text><Text style={styles.macroSubtitle}>del día seleccionado</Text></View>
      <MacroMeter label={'Prote\u00ednas'} intake={macros.proteinas} target={macroTargets.proteinas} />
      <MacroMeter label="Carbohidratos" intake={macros.carbohidratos} target={macroTargets.carbohidratos} />
      <MacroMeter label="Grasas" intake={macros.grasas} target={macroTargets.grasas} />
      {macrosIncomplete > 0 && <Text style={styles.macroNote}>{macrosIncomplete} consumo(s) con datos incompletos; los totales pueden ser parciales.</Text>}
      <Text style={styles.macroNote}>{`Rangos de referencia adultos: carbohidratos 45\u201365%, prote\u00ednas 10\u201335% y grasas 20\u201335% de las kcal. Cada rango se interpreta por separado.`}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  widget: { gap: 12 },
  card: { overflow: 'hidden', position: 'relative', padding: 22, borderRadius: 28, gap: 16, backgroundColor: palette.green },
  glowOne: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -85, top: -90, backgroundColor: 'rgba(255,255,255,0.06)' },
  glowTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, left: -65, bottom: 50, backgroundColor: 'rgba(242,223,180,0.08)' },
  chartWrap: { alignSelf: 'center', width: 224, height: 224, marginVertical: 2, justifyContent: 'center', alignItems: 'center' },
  chart: { position: 'absolute' },
  chartCenter: { alignItems: 'center', gap: 3 },
  consumed: { color: '#FFFFFF', fontSize: 35, fontWeight: '800', letterSpacing: -1 },
  unit: { color: '#DCE9DF', fontSize: 10, letterSpacing: 1.3, fontWeight: '700' },
  range: { flexDirection: 'row', gap: 10 },
  targetBox: { flex: 1, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,255,255,0.12)', gap: 5 },
  targetLabel: { color: '#DCE9DF', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  targetValue: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', marginTop: 2 },
  kcal: { color: '#DCE9DF', fontSize: 12, fontWeight: '600' },
  percent: { color: palette.amber, fontSize: 12, fontWeight: '700' },
  footnote: { color: '#DCE9DF', fontSize: 11, lineHeight: 16 },
  macroCard: { padding: 18, borderRadius: 22, gap: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  macroTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  macroTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  macroSubtitle: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  macroItem: { gap: 6 },
  macroHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroName: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  macroIntake: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  macroTrack: { height: 11, borderRadius: 6, backgroundColor: palette.greenSoft, overflow: 'hidden', position: 'relative' },
  macroFill: { height: '100%', borderRadius: 6 },
  macroMinimumMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: palette.ink },
  macroTarget: { color: palette.muted, fontSize: 11 },
  macroNote: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  emptyCard: { alignItems: 'center', padding: 25, borderRadius: 28, backgroundColor: palette.green, gap: 10 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { color: palette.amber, fontSize: 25 },
  emptyTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  emptyDescription: { color: '#DCE9DF', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  profileLink: { marginTop: 3, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  profileLinkText: { color: palette.amber, fontSize: 14, fontWeight: '800' },
});
