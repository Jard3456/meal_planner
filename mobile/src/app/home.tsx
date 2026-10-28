import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, FormNotice } from '@/components/form-controls';
import { CalorieGoalChart } from '@/components/calorie-goal-chart';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { consumePendingDashboardDate } from '@/services/dashboard-refresh';
import { foodUnits, getConsumptions, getDashboard, getPlans, type Consumption, type Dashboard, type MealPlan } from '@/services/meal-planner';

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function HomeScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Dashboard | null>(null);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [focusRefresh, setFocusRefresh] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const displayName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || 'Usuario';
  const initial = displayName.charAt(0).toLocaleUpperCase('es');
  const today = dateKey(new Date());
  const monthTitle = calendarMonth.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  const firstOffset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarDays: (number | null)[] = [...Array.from({ length: firstOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  useFocusEffect(useCallback(() => {
    const pendingDate = consumePendingDashboardDate();
    if (!pendingDate) return;
    const timer = setTimeout(() => {
      setSelectedDate(pendingDate);
      setCalendarMonth(new Date(`${pendingDate}T12:00:00`));
      setFocusRefresh(value => value + 1);
    }, 0);
    return () => clearTimeout(timer);
  }, []));

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      Promise.all([getDashboard(selectedDate), getPlans(selectedDate, selectedDate), getConsumptions(selectedDate, selectedDate)])
        .then(([stats, planRows, intake]) => { if (active) { setSummary(stats); setPlans(planRows); setConsumptions(intake); } })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, selectedDate, focusRefresh]);

  return (
    <MealScreen title="" subtitle="" showBrand={false} showHeading={false}>
      <AccountGate>
        <View style={styles.content}>
          <View style={styles.summaryHeader}>
            <View accessibilityLabel={`Usuario: ${displayName}`} style={styles.userBadge}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
              <Text numberOfLines={1} style={styles.userName}>{displayName}</Text>
            </View>
          </View>
          <View style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <View style={styles.monthControls}>
                <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthArrow}>{'\u2039'}</Text></Pressable>
                <Text style={styles.monthTitle}>{monthTitle.charAt(0).toLocaleUpperCase('es') + monthTitle.slice(1)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthArrow}>{'\u203a'}</Text></Pressable>
              </View>
              {selectedDate !== today && <Pressable accessibilityRole="button" onPress={() => { setSelectedDate(today); setCalendarMonth(new Date()); }}><Text style={styles.todayLink}>Hoy</Text></Pressable>}
            </View>
            <View style={styles.calendarGrid}>
              {weekdays.map((day, index) => <View key={`weekday-${index}`} style={styles.calendarCell}><Text style={styles.weekday}>{day}</Text></View>)}
              {calendarDays.map((day, index) => {
                if (day == null) return <View key={`blank-${index}`} style={styles.calendarCell} />;
                const key = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                const isSelected = key === selectedDate;
                const isToday = key === today;
                const dateLabel = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                return <Pressable key={key} accessibilityRole="button" accessibilityLabel={dateLabel} accessibilityState={{ selected: isSelected }} onPress={() => setSelectedDate(key)} style={[styles.calendarCell, styles.dayCell, isToday && styles.todayCell, isSelected && styles.selectedCell]}><Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day}</Text></Pressable>;
              })}
            </View>
          </View>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando resumen" color={palette.green} size="large" /> : error ? <FormNotice>{error}</FormNotice> : <>
            {user && <CalorieGoalChart user={user} calories={summary?.calorias ?? 0} macros={{ proteinas: summary?.proteinas ?? 0, carbohidratos: summary?.carbohidratos ?? 0, grasas: summary?.grasas ?? 0 }} macrosIncomplete={summary?.macros_incompletos ?? 0} />}
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statNumber}>{summary?.calorias ?? 0}</Text><Text style={styles.statLabel}>kcal registradas</Text></View>
              <View style={styles.stat}><Text style={styles.statNumber}>{summary?.comidas ?? 0}</Text><Text style={styles.statLabel}>comidas planeadas</Text></View>
              <View style={styles.stat}><Text style={styles.statNumber}>{summary?.recetas ?? 0}</Text><Text style={styles.statLabel}>recetas guardadas</Text></View>
            </View>
            {plans.length ? plans.map(plan => <View key={plan.id_plan} style={styles.todayGroup}>
              <Text style={styles.todayGroupTitle}>{plan.nombre_plan}</Text>
              {plan.comidas.filter(meal => meal.fecha === selectedDate).map(meal => <View key={meal.id_comida} style={styles.homeMeal}>
                <Text style={styles.homeMealTitle}>{meal.tipo_comida}{meal.hora ? ', ' + meal.hora : ''}</Text>
                {meal.alimentos.length ? meal.alimentos.map(food => <Text key={food.id_detalle} style={styles.todayLine}>{'\u2022'} {food.nombre} · recomendado: {food.cantidad} {foodUnits.find(item => item.value === food.unidad_medida)?.label}{food.cantidad_consumida == null ? '' : ' · consumido: ' + food.cantidad_consumida + ' ' + foodUnits.find(item => item.value === (food.unidad_consumida ?? food.unidad_medida))?.label}</Text>) : <Text style={styles.todayLine}>Aún no hay alimentos agregados a esta comida.</Text>}
              </View>)}
            </View>) : <Text style={styles.cardBody}>{'No hay comidas planificadas para ' + (selectedDate === today ? 'hoy' : selectedDate) + '.'}</Text>}
            {consumptions.length > 0 && <View style={styles.todayGroup}><Text style={styles.todayGroupTitle}>Consumo registrado</Text>{consumptions.map(item => <Text key={item.id_consumo} style={styles.todayLine}>{'\u2022'} {item.alimento} {'\u00b7'} {item.cantidad} {item.unidad_medida}{item.calorias_totales == null ? '' : ` \u00b7 ${item.calorias_totales} kcal`}</Text>)}</View>}
          </>}
        </View>
      </AccountGate>
    </MealScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  userBadge: { maxWidth: '75%', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, paddingLeft: 7, paddingRight: 14, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  userName: { color: palette.ink, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  calendar: { padding: 16, borderRadius: 22, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  monthButtonDisabled: { opacity: 0.35 },
  monthArrow: { color: palette.green, fontSize: 27, lineHeight: 30 },
  monthTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', minWidth: 125 },
  todayLink: { color: palette.green, fontSize: 13, fontWeight: '700', padding: 6 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.2857%', height: 38, alignItems: 'center', justifyContent: 'center' },
  weekday: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  dayCell: { borderRadius: 13 },
  dayText: { color: palette.ink, fontSize: 13, fontWeight: '600' },
  todayCell: { borderWidth: 1, borderColor: palette.green },
  selectedCell: { backgroundColor: palette.green, borderColor: palette.green },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },
  futureCell: { opacity: 0.3 },
  futureDayText: { color: palette.muted },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '28%', padding: 14, borderRadius: 16, backgroundColor: palette.greenSoft, gap: 4 },
  statNumber: { color: palette.green, fontSize: 21, fontWeight: '800' },
  statLabel: { color: palette.muted, fontSize: 12 },
  todayGroup: { gap: 8, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14 },
  todayGroupTitle: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  homeMeal: { gap: 4, paddingVertical: 5 },
  homeMealTitle: { color: palette.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  todayLine: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  cardBody: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
