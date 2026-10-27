import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, ChoiceChips, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { FoodCatalog } from '@/components/food-catalog';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { estimateDailyCalories, type CalorieRange } from '@/utils/calorie-estimate';
import { addMealFood, createMeal, createPlan, deleteMeal, deleteMealFood, deletePlan, foodReference, foodUnits, generateMeals, getPlans, mealTypes, updateMeal, updatePlan, type FoodSelection, type MealPlan } from '@/services/meal-planner';
import type { FoodUnit, MealType } from '@/types/meal-planner';

function dateText(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function mondayOf(date: Date) { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value; }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateText(date); }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }); }
function formatRangeDate(value: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Seleccionar'; }
const mealShare: Partial<Record<MealType, number>> = { desayuno: 1 / 3, almuerzo: 1 / 3, cena: 1 / 3 };
const mealIdeas: Partial<Record<MealType, string>> = {
  desayuno: 'Ideas de alimentos: avena o pan integral, fruta y huevo o yogur.',
  almuerzo: 'Ideas de alimentos: arroz o frijoles, pollo o tofu y verduras.',
  cena: 'Ideas de alimentos: papa o tortilla, frijoles o huevo y verduras.',
};
function mealCalories(meal: MealPlan['comidas'][number]) {
  let calories = 0;
  let missing = 0;
  for (const food of meal.alimentos) {
    if (food.unidad_medida !== 'g' || food.calorias_por_100g == null) missing++;
    else calories += food.calorias_por_100g * food.cantidad / 100;
  }
  return { calories: Math.round(calories), missing };
}
function MealCalories({ meal, range }: { meal: MealPlan['comidas'][number]; range: CalorieRange | null }) {
  const total = mealCalories(meal);
  const share = mealShare[meal.tipo_comida];
  const min = range && share ? Math.round(range.minimum * share) : null;
  const max = range && share ? Math.round(range.maximum * share) : null;
  return <View style={styles.calorieSummary}>
    {min != null && max != null && <Text style={styles.calorieGoal}>Meta estimada: {min}–{max} kcal · 1/3 del día</Text>}
    <Text style={styles.calorieTotal}>{total.calories.toLocaleString('es-GT')} kcal de alimentos</Text>
    {total.missing > 0 && <Text style={styles.calorieHint}>{total.missing} alimento(s) sin cálculo; se necesita cantidad en gramos y kcal por 100 g.</Text>}
    {mealIdeas[meal.tipo_comida] && <Text style={styles.mealIdea}>{mealIdeas[meal.tipo_comida]}</Text>}
  </View>;
}

export default function PlannerScreen() {
  const { user } = useAuth();
  const calorieRange = user ? estimateDailyCalories(user) : null;
  const [week, setWeek] = useState(() => dateText(mondayOf(new Date())));
  const weekEnd = useMemo(() => shiftDate(week, 6), [week]);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const [planName, setPlanName] = useState('Mi plan semanal');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editingMeal, setEditingMeal] = useState<{ id: number; type: MealType; date: string; time: string } | null>(null);
  const [activeMeal, setActiveMeal] = useState<number | null>(null);
  const [selectedFood, setSelectedFood] = useState<FoodSelection | null>(null);
  const [amount, setAmount] = useState('100');
  const [unit, setUnit] = useState<FoodUnit>('g');
  const [mealKind, setMealKind] = useState<MealType>('desayuno');
  function navigateWeek(offset: number) {
    setWeek(shiftDate(week, offset));
  }
  function chooseRangeDate(date: string) {
    setError(''); setSuccess('');
    if (!rangeStart || rangeEnd) { setRangeStart(date); setRangeEnd(null); }
    else if (date < rangeStart) { setRangeStart(date); setRangeEnd(null); }
    else setRangeEnd(date);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getPlans(week, weekEnd).then(data => { if (active) setPlans(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus planes.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, week, weekEnd, reload]);

  async function makePlan() {
    setBusy(true); setError('');
    try { await createPlan({ nombre_plan: planName, fecha_inicio: rangeStart && rangeEnd ? rangeStart : week, fecha_fin: rangeStart && rangeEnd ? rangeEnd : weekEnd, observaciones: notes || null }); setPlanName(''); setNotes(''); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el plan.'); }
    finally { setBusy(false); }
  }
  async function savePlan(plan: MealPlan) {
    setBusy(true); setError('');
    try { await updatePlan(plan.id_plan, { nombre_plan: editName, fecha_inicio: editFrom, fecha_fin: editTo, observaciones: editNotes || null }); setEditing(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el plan.'); }
    finally { setBusy(false); }
  }
  function confirmDeletePlan(plan: MealPlan) { Alert.alert('Eliminar plan', `Se eliminarán también sus comidas planificadas. ¿Eliminar “${plan.nombre_plan}”?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deletePlan(plan.id_plan).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); } }]); }
  async function addMeal(plan: MealPlan) {
    setBusy(true); setError('');
    try { const date = rangeStart ?? week; const boundedDate = date < plan.fecha_inicio ? plan.fecha_inicio : date > plan.fecha_fin ? plan.fecha_fin : date; const result = await createMeal(plan.id_plan, { tipo_comida: mealKind, fecha: boundedDate, hora: null }); setActiveMeal(result.id_comida); setSelectedFood(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar la comida.'); }
    finally { setBusy(false); }
  }
  async function generateMealRange(plan: MealPlan) {
    if (!rangeStart || !rangeEnd) { setError('Selecciona primero la fecha de inicio y la fecha final.'); return; }
    if (rangeStart < plan.fecha_inicio || rangeEnd > plan.fecha_fin) { setError('El intervalo seleccionado debe quedar dentro de las fechas de este plan.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await generateMeals(plan.id_plan, { fecha_inicio: rangeStart, fecha_fin: rangeEnd });
      setSuccess(result.created_count ? `Se crearon ${result.created_count} comidas para el intervalo seleccionado.` : 'Ese intervalo ya tenía desayuno, almuerzo y cena en todos sus días.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron crear las comidas.'); }
    finally { setReload(n => n + 1); setBusy(false); }
  }
  async function attachFood() {
    if (!activeMeal || !selectedFood) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Ingresa una cantidad mayor que cero.'); return; }
    setBusy(true); setError('');
    try { await addMealFood(activeMeal, { ...foodReference(selectedFood), cantidad: numericAmount, unidad_medida: unit }); setSelectedFood(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar el alimento.'); }
    finally { setBusy(false); }
  }
  function selectFood(food: FoodSelection) {
    setSelectedFood(food);
    if (food.cantidad_sugerida_g != null) { setAmount(String(food.cantidad_sugerida_g)); setUnit('g'); }
  }
  async function saveMeal() {
    if (!editingMeal) return;
    setBusy(true); setError('');
    try { await updateMeal(editingMeal.id, { tipo_comida: editingMeal.type, fecha: editingMeal.date, hora: editingMeal.time || null }); setEditingMeal(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la comida.'); }
    finally { setBusy(false); }
  }
  function confirmDeleteMeal(planNameValue: string, mealId: number) { Alert.alert('Eliminar comida', `¿Eliminar esta comida de “${planNameValue}”?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deleteMeal(mealId).then(() => { if (activeMeal === mealId) setActiveMeal(null); setReload(n => n + 1); }).catch(e => setError(e.message)); } }]); }

  return <MealScreen title="Tu semana, a tu ritmo." subtitle="Organiza planes y comidas con alimentos guardados en tu catálogo.">
    <AccountGate>
      <View style={styles.week}><Pressable accessibilityRole="button" onPress={() => navigateWeek(-7)} style={styles.weekButton}><Text style={styles.weekButtonText}>‹ Anterior</Text></Pressable><Text style={styles.weekLabel}>{formatDate(week)} – {formatDate(weekEnd)}</Text><Pressable accessibilityRole="button" onPress={() => navigateWeek(7)} style={styles.weekButton}><Text style={styles.weekButtonText}>Siguiente ›</Text></Pressable></View>
      <View style={styles.rangePrompt}><Text style={styles.rangeTitle}>Fechas para generar comidas</Text><Text style={styles.rangeDates}>{formatRangeDate(rangeStart)} {'\u2192'} {formatRangeDate(rangeEnd)}</Text><Text style={styles.rangeHint}>Selecciona inicio y luego fin. Puedes cambiar de semana para completar el intervalo.</Text></View>
      <View style={styles.dayPicker}>{Array.from({ length: 7 }, (_, index) => {
        const date = shiftDate(week, index);
        const value = new Date(`${date}T12:00:00`);
        const inRange = !!rangeStart && !!rangeEnd && date >= rangeStart && date <= rangeEnd;
        const isStart = date === rangeStart;
        const isEnd = date === rangeEnd;
        const weekday = value.toLocaleDateString('es-GT', { weekday: 'short' }).replace('.', '');
        return <Pressable key={date} accessibilityRole="button" accessibilityLabel={value.toLocaleDateString('es-GT', { dateStyle: 'full' })} accessibilityState={{ selected: isStart || isEnd }} onPress={() => chooseRangeDate(date)} style={[styles.dayButton, inRange && styles.dayButtonInRange, (isStart || isEnd) && styles.dayButtonSelected]}><Text style={[styles.dayName, (isStart || isEnd) && styles.dayNameSelected]}>{weekday}</Text><Text style={[styles.dayNumber, (isStart || isEnd) && styles.dayNameSelected]}>{value.getDate()}</Text></Pressable>;
      })}</View>
      <View style={styles.card}><Text style={styles.sectionTitle}>{rangeStart && rangeEnd ? 'Crear un plan para el intervalo' : 'Crear un plan semanal'}</Text><FormField label="Nombre del plan" value={planName} onChangeText={setPlanName} maxLength={150} editable={!busy} /><FormField label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} /><FormButton label={rangeStart && rangeEnd ? 'Guardar plan para el intervalo' : 'Guardar plan semanal'} onPress={() => { void makePlan(); }} busy={busy} /></View>
      {!!error && <FormNotice>{error}</FormNotice>}
      {!!success && <FormNotice tone="success">{success}</FormNotice>}
      {loading ? <ActivityIndicator accessibilityLabel="Cargando planes" color={palette.green} /> : plans.length === 0 ? <View style={styles.card}><Text style={styles.body}>Aún no hay planes para esta semana. Crea uno para empezar.</Text></View> : plans.map(plan => <View key={plan.id_plan} style={styles.card}>
        {editing === plan.id_plan ? <><FormField label="Nombre del plan" value={editName} onChangeText={setEditName} maxLength={150} /><FormField label="Fecha inicial (AAAA-MM-DD)" value={editFrom} onChangeText={setEditFrom} maxLength={10} /><FormField label="Fecha final (AAAA-MM-DD)" value={editTo} onChangeText={setEditTo} maxLength={10} /><FormField label="Notas" value={editNotes} onChangeText={setEditNotes} multiline maxLength={2000} /><FormButton label="Guardar cambios" onPress={() => { void savePlan(plan); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditing(null)} /></> : <><View style={styles.row}><View style={styles.grow}><Text style={styles.sectionTitle}>{plan.nombre_plan}</Text><Text style={styles.body}>{formatDate(plan.fecha_inicio)} – {formatDate(plan.fecha_fin)}</Text></View><Pressable accessibilityRole="button" onPress={() => { setEditing(plan.id_plan); setEditName(plan.nombre_plan); setEditFrom(plan.fecha_inicio); setEditTo(plan.fecha_fin); setEditNotes(plan.observaciones ?? ''); }}><Text style={styles.link}>Editar</Text></Pressable></View>{plan.observaciones && <Text style={styles.body}>{plan.observaciones}</Text>}
        {plan.comidas.map(meal => <View key={meal.id_comida} style={styles.meal}><View style={styles.row}><View style={styles.grow}><Text style={styles.mealTitle}>{mealTypes.find(item => item.value === meal.tipo_comida)?.label ?? meal.tipo_comida}</Text><Text style={styles.body}>{formatDate(meal.fecha)}{meal.hora ? ` · ${meal.hora}` : ''}</Text><MealCalories meal={meal} range={calorieRange} /></View><Pressable accessibilityRole="button" onPress={() => setEditingMeal({ id: meal.id_comida, type: meal.tipo_comida, date: meal.fecha, time: meal.hora ?? '' })}><Text style={styles.link}>Editar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDeleteMeal(plan.nombre_plan, meal.id_comida)}><Text style={styles.delete}>Eliminar</Text></Pressable></View>{editingMeal?.id === meal.id_comida && <View style={styles.editMeal}><ChoiceChips options={mealTypes} value={editingMeal.type} onChange={type => setEditingMeal(value => value && ({ ...value, type }))} /><FormField label="Fecha (AAAA-MM-DD)" value={editingMeal.date} onChangeText={date => setEditingMeal(value => value && ({ ...value, date }))} maxLength={10} /><FormField label="Hora (opcional, HH:MM)" value={editingMeal.time} onChangeText={time => setEditingMeal(value => value && ({ ...value, time }))} maxLength={5} /><FormButton label="Guardar comida" onPress={() => { void saveMeal(); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditingMeal(null)} /></View>}{meal.alimentos.map(food => <View key={food.id_detalle} style={styles.foodLine}><Text style={[styles.body, styles.grow]}>{food.nombre} · {food.cantidad} {foodUnits.find(item => item.value === food.unidad_medida)?.label}</Text><Pressable accessibilityRole="button" onPress={() => { void deleteMealFood(food.id_detalle).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); }}><Text style={styles.delete}>Quitar</Text></Pressable></View>)}</View>)}
        <Text style={styles.label}>Generar comidas para el intervalo</Text><FormButton label="Crear desayuno, almuerzo y cena por día" secondary onPress={() => { void generateMealRange(plan); }} busy={busy} /><Text style={styles.label}>Agregar una comida manual para {formatDate(rangeStart ?? week)}</Text><ChoiceChips options={mealTypes} value={mealKind} onChange={setMealKind} /><FormButton label="Crear comida" secondary onPress={() => { void addMeal(plan); }} busy={busy} /><FormButton label="Eliminar plan" danger onPress={() => confirmDeletePlan(plan)} />
        </>}
      </View>)}
      {activeMeal != null && <View style={styles.card}><View style={styles.row}><Text style={styles.sectionTitle}>Agregar alimentos a la comida</Text><Pressable accessibilityRole="button" onPress={() => { setActiveMeal(null); setSelectedFood(null); }}><Text style={styles.link}>Cerrar</Text></Pressable></View><FoodCatalog selectable selectedId={selectedFood && 'id_alimento' in selectedFood ? selectedFood.id_alimento ?? null : null} selectedName={selectedFood?.nombre} onSelect={selectFood} allowCreate /><FormField label="Cantidad" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />{selectedFood?.cantidad_sugerida_g != null && <Text style={styles.body}>Porción sugerida: {selectedFood.cantidad_sugerida_g} g. Puedes modificarla.</Text>}<ChoiceChips options={foodUnits} value={unit} onChange={setUnit} />{selectedFood && <FormButton label={`Agregar ${selectedFood.nombre}`} onPress={() => { void attachFood(); }} busy={busy} />}</View>}
    </AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }, weekButton: { paddingVertical: 10 }, weekButtonText: { color: palette.green, fontWeight: '700', fontSize: 13 }, weekLabel: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  rangePrompt: { padding: 15, borderRadius: 16, backgroundColor: palette.greenSoft, gap: 5 }, rangeTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' }, rangeDates: { color: palette.green, fontSize: 16, fontWeight: '800' }, rangeHint: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  dayPicker: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, dayButton: { flex: 1, minWidth: 34, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 13, gap: 4 }, dayButtonInRange: { backgroundColor: palette.greenSoft }, dayButtonSelected: { backgroundColor: palette.green }, dayName: { color: palette.muted, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }, dayNumber: { color: palette.ink, fontSize: 14, fontWeight: '700' }, dayNameSelected: { color: '#FFFFFF' },
  card: { padding: 20, gap: 15, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }, sectionTitle: { fontSize: 19, fontWeight: '700', color: palette.ink }, body: { fontSize: 14, lineHeight: 21, color: palette.muted }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1 }, link: { color: palette.green, fontSize: 14, fontWeight: '700', padding: 6 }, delete: { color: '#A72E2E', fontSize: 13, fontWeight: '600', padding: 6 }, meal: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14, gap: 10 }, mealTitle: { fontSize: 16, fontWeight: '700', color: palette.ink, textTransform: 'capitalize' }, foodLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, label: { color: palette.ink, fontSize: 14, fontWeight: '600' }, calorieSummary: { marginTop: 4, gap: 3 }, calorieGoal: { color: palette.green, fontSize: 12, fontWeight: '700' }, calorieTotal: { color: palette.ink, fontSize: 12, fontWeight: '600' }, calorieHint: { color: palette.muted, fontSize: 11, lineHeight: 16 }, mealIdea: { color: palette.muted, backgroundColor: palette.greenSoft, padding: 9, borderRadius: 10, fontSize: 12, lineHeight: 18 }, editMeal: { padding: 14, gap: 12, backgroundColor: palette.background, borderRadius: 14 },
});
