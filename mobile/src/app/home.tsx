import { useEffect, useState } from 'react';
import { Link, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, FormButton, FormNotice } from '@/components/form-controls';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { getConsumptions, getDashboard, getPlans, type Consumption, type Dashboard, type MealPlan } from '@/services/meal-planner';

const sections: { href: Href; title: string; description: string; number: string }[] = [
  { href: '/planner', title: 'Planificador', description: 'Dale un lugar a cada comida de tu semana.', number: '01' },
  { href: '/history', title: 'Historial', description: 'Un espacio para revisar tu alimentación.', number: '02' },
  { href: '/recipes', title: 'Recetas', description: 'Conserva tus ideas favoritas para cocinar.', number: '03' },
  { href: '/profile', title: 'Mi perfil', description: 'Tus objetivos, a tu propio ritmo.', number: '04' },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Dashboard | null>(null);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const today = (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; })();
  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      Promise.all([getDashboard(today), getPlans(today, today), getConsumptions(today, today)])
        .then(([stats, planRows, intake]) => { if (active) { setSummary(stats); setPlans(planRows); setConsumptions(intake); } })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, today, reload]);
  return (
    <MealScreen title="Comer bien empieza con un pequeño plan." subtitle="Organiza tu alimentación, un día a la vez.">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>UN MOMENTO PARA TI</Text>
        <Text style={styles.heroTitle}>Haz espacio para tus buenos hábitos.</Text>
        <Text style={styles.heroBody}>Tu planificación y lo que consumes son parte de la misma historia.</Text>
        <Link href="/planner" asChild>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonLabel}>Explorar mi planificador →</Text>
          </Pressable>
        </Link>
      </View>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Tu espacio de alimentación</Text>
      <View style={styles.grid}>
        {sections.map((section) => (
          <Link key={section.title} href={section.href} asChild>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <Text style={styles.number}>{section.number}</Text>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <Text style={styles.cardBody}>{section.description}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
      <AccountGate>
        <View style={styles.summary}>
          <View style={styles.summaryHeader}><Text style={styles.sectionTitle}>Tu día de hoy</Text><Pressable accessibilityRole="button" onPress={() => setReload(value => value + 1)}><Text style={styles.refresh}>Actualizar</Text></Pressable></View>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando resumen" color={palette.green} /> : error ? <FormNotice>{error}</FormNotice> : <>
            <View style={styles.stats}><View style={styles.stat}><Text style={styles.statNumber}>{summary?.calorias ?? 0}</Text><Text style={styles.statLabel}>kcal registradas</Text></View><View style={styles.stat}><Text style={styles.statNumber}>{summary?.comidas ?? 0}</Text><Text style={styles.statLabel}>comidas planeadas</Text></View><View style={styles.stat}><Text style={styles.statNumber}>{summary?.recetas ?? 0}</Text><Text style={styles.statLabel}>recetas guardadas</Text></View></View>
            {plans.length ? plans.map(plan => <View key={plan.id_plan} style={styles.todayGroup}><Text style={styles.todayGroupTitle}>{plan.nombre_plan}</Text>{plan.comidas.filter(meal => meal.fecha === today).map(meal => <Text key={meal.id_comida} style={styles.todayLine}>• {meal.tipo_comida}{meal.hora ? `, ${meal.hora}` : ''}: {meal.alimentos.map(food => food.nombre).join(', ') || 'sin alimentos agregados'}</Text>)}</View>) : <Text style={styles.cardBody}>Aún no tienes comidas planificadas para hoy.</Text>}
            {consumptions.length > 0 && <View style={styles.todayGroup}><Text style={styles.todayGroupTitle}>Consumo registrado</Text>{consumptions.map(item => <Text key={item.id_consumo} style={styles.todayLine}>• {item.alimento} · {item.cantidad} {item.unidad_medida}{item.calorias_totales == null ? '' : ` · ${item.calorias_totales} kcal`}</Text>)}</View>}
          </>}
          <View style={styles.quickLinks}><Link href="/planner" asChild><Pressable accessibilityRole="button" style={styles.quickButton}><Text style={styles.quickText}>Planear una comida</Text></Pressable></Link><Link href="/history" asChild><Pressable accessibilityRole="button" style={styles.quickButton}><Text style={styles.quickText}>Registrar consumo</Text></Pressable></Link></View>
        </View>
      </AccountGate>
    </MealScreen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 24, borderRadius: 26, backgroundColor: palette.green, gap: 16 },
  eyebrow: { color: palette.amber, fontWeight: '700', fontSize: 11, letterSpacing: 1.5 },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '700', lineHeight: 34 },
  heroBody: { color: '#E2EDDF', fontSize: 15, lineHeight: 24 },
  button: { backgroundColor: palette.amber, borderRadius: 14, padding: 16, alignSelf: 'flex-start' },
  buttonLabel: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.75 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: palette.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: '45%', minWidth: 135, borderRadius: 20, padding: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 9 },
  number: { color: palette.green, fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: palette.ink },
  cardBody: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  summary: { padding: 22, borderRadius: 22, gap: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, refresh: { color: palette.green, fontWeight: '700', padding: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, stat: { flexGrow: 1, flexBasis: '28%', padding: 14, borderRadius: 14, backgroundColor: palette.greenSoft, gap: 4 }, statNumber: { color: palette.green, fontSize: 21, fontWeight: '800' }, statLabel: { color: palette.muted, fontSize: 12 },
  todayGroup: { gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14 }, todayGroupTitle: { color: palette.ink, fontSize: 15, fontWeight: '700' }, todayLine: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickButton: { borderRadius: 12, backgroundColor: palette.green, padding: 12 }, quickText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
