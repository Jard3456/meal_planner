import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, ChoiceChips, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { FoodCatalog } from '@/components/food-catalog';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { setPendingDashboardDate } from '@/services/dashboard-refresh';
import { estimateDailyCalories, estimateMacroTargets, type CalorieRange, type MacroRange } from '@/utils/calorie-estimate';
import { addMealFood, createMeal, createPlan, deleteMeal, deleteMealFood, deletePlan, foodReference, foodUnits, generateMeals, getPlans, mealTypes, updateMeal, updateMealFoodConsumption, updateMealReferencePortions, updatePlan, type FoodSelection, type MealFood, type MealPlan, type MacroKey, type ReferencePortion } from '@/services/meal-planner';
import type { FoodUnit, MealType } from '@/types/meal-planner';

function dateText(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }); }
function formatRangeDate(value: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Seleccionar'; }
const mealShare: Partial<Record<MealType, number>> = { desayuno: 1 / 3, almuerzo: 1 / 3, cena: 1 / 3 };
function mealCalories(meal: MealPlan['comidas'][number]) {
  let calories = 0;
  let pending = 0;
  let incomplete = 0;
  for (const food of meal.alimentos) {
    if (food.cantidad_consumida == null) { pending++; continue; }
    const unit = food.unidad_consumida ?? food.unidad_medida;
    if (unit !== 'g' || food.calorias_por_100g == null) incomplete++;
    else calories += food.calorias_por_100g * food.cantidad_consumida / 100;
  }
  for (const key of ['proteinas', 'carbohidratos', 'grasas'] as const) calories += meal.referencias_completadas?.[key]?.calorias ?? 0;
  return { calories: Math.round(calories), pending, incomplete };
}
function MealCalories({ meal, range }: { meal: MealPlan['comidas'][number]; range: CalorieRange | null }) {
  const total = mealCalories(meal);
  const share = mealShare[meal.tipo_comida];
  const min = range && share ? Math.round(range.minimum * share) : null;
  const max = range && share ? Math.round(range.maximum * share) : null;
  return <View style={styles.calorieSummary}>
    {min != null && max != null && <Text style={styles.calorieGoal}>Meta estimada: {min}–{max} kcal · 1/3 del día</Text>}
    <Text style={styles.calorieTotal}>{total.calories.toLocaleString('es-GT')} kcal registradas como consumidas</Text>
    {total.pending > 0 && <Text style={styles.calorieHint}>{total.pending} alimento(s) pendiente(s) de registrar; los totales reflejan solo cantidades consumidas registradas.</Text>}
    {total.incomplete > 0 && <Text style={styles.calorieHint}>{total.incomplete} consumo(s) sin cálculo; se necesita cantidad en gramos y kcal por 100 g.</Text>}
  </View>;
}
function mealMacroTotals(meal: MealPlan['comidas'][number]) {
  const totals = { proteinas: 0, carbohidratos: 0, grasas: 0 };
  let incomplete = 0;
  let pending = 0;
  for (const food of meal.alimentos) {
    if (food.cantidad_consumida == null) { pending++; continue; }
    const unit = food.unidad_consumida ?? food.unidad_medida;
    if (unit !== 'g') {
      incomplete++;
      continue;
    }
    let foodIncomplete = false;
    for (const key of ['proteinas', 'carbohidratos', 'grasas'] as const) {
      if (food[key] == null) foodIncomplete = true;
      else totals[key] += food[key] * food.cantidad_consumida / 100;
    }
    if (foodIncomplete) incomplete++;
  }
  for (const key of ['proteinas', 'carbohidratos', 'grasas'] as const) totals[key] += meal.referencias_completadas?.[key]?.macro_gramos ?? 0;
  return { totals, incomplete, pending };
}
const macroFoodExamples = {
  proteinas: { name: 'pollo cocido', macroPerUnit: 31 },
  carbohidratos: { name: 'arroz cocido', macroPerUnit: 28 },
  grasas: { name: 'aceite de oliva', macroPerUnit: 14 },
};
function macroPortionSuggestion(key: MacroKey, missing: number): Pick<ReferencePortion, 'cantidad' | 'unidad'> {
  const example = macroFoodExamples[key];
  if (key === 'grasas') return { cantidad: Math.ceil(missing / example.macroPerUnit * 2) / 2, unidad: 'cda' };
  return { cantidad: Math.ceil(missing / example.macroPerUnit * 10) * 10, unidad: 'g' };
}
function referencePortionLabel(key: MacroKey, portion: ReferencePortion | Pick<ReferencePortion, 'cantidad' | 'unidad'>) {
  const example = macroFoodExamples[key];
  const name = 'alimento' in portion ? portion.alimento : example.name;
  const macroGrams = 'macro_gramos' in portion
    ? portion.macro_gramos
    : Math.round(portion.cantidad * example.macroPerUnit * (portion.unidad === 'g' ? 0.01 : 1));
  const amount = Number.isInteger(portion.cantidad) ? String(portion.cantidad) : String(portion.cantidad).replace('.', ',');
  const macroName = key === 'proteinas' ? 'proteina' : key === 'carbohidratos' ? 'carbohidratos' : 'grasa';
  return name + ': aprox. ' + amount + ' ' + portion.unidad + ' (' + macroGrams + ' g de ' + macroName + ')';
}
function MealMacroDetail({ meal, targets, onToggleReference, busy, canMark }: { meal: MealPlan['comidas'][number]; targets: ReturnType<typeof estimateMacroTargets>; onToggleReference: (mealId: number, key: MacroKey, portion: Pick<ReferencePortion, 'cantidad' | 'unidad'> | null) => void; busy: boolean; canMark: boolean }) {
  const [drafts, setDrafts] = useState<Partial<Record<MacroKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<MacroKey, string>>>({});
  const share = mealShare[meal.tipo_comida];
  if (!targets || !share) return null;
  const { totals, incomplete, pending } = mealMacroTotals(meal);
  const items: { key: MacroKey; label: string; target: MacroRange }[] = [
    { key: 'proteinas', label: 'Proteinas', target: targets.proteinas },
    { key: 'carbohidratos', label: 'Carbohidratos', target: targets.carbohidratos },
    { key: 'grasas', label: 'Grasas', target: targets.grasas },
  ];
  function savePortion(key: MacroKey, portion: Pick<ReferencePortion, 'cantidad' | 'unidad'>) {
    if (!canMark) return;
    const raw = drafts[key] ?? String(portion.cantidad);
    const amount = Number(raw.replace(',', '.'));
    if (!raw.trim() || !Number.isFinite(amount) || amount <= 0) {
      setErrors(current => ({ ...current, [key]: 'Ingresa una cantidad mayor que cero.' }));
      return;
    }
    setErrors(current => ({ ...current, [key]: '' }));
    onToggleReference(meal.id_comida, key, { cantidad: amount, unidad: portion.unidad });
  }
  return <View style={styles.macroPanel}>
    <Text style={styles.macroPanelTitle}>Macros consumidos · referencia: 1/3 de la meta diaria</Text>
    {items.map(item => {
      const actual = totals[item.key];
      const minimum = Math.round(item.target.minimum * share);
      const maximum = Math.round(item.target.maximum * share);
      const status = actual < minimum ? 'Faltan ' + Math.ceil(minimum - actual) + ' g para el minimo' : actual > maximum ? 'Sobre el maximo por ' + Math.ceil(actual - maximum) + ' g' : 'Dentro del rango estimado';
      return <View key={item.key} style={styles.macroProgress}>
        <View style={styles.macroLine}><Text style={styles.macroName}>{item.label}</Text><Text style={styles.macroAmount}>{Math.round(actual) + ' g / ' + minimum + '-' + maximum + ' g'}</Text></View>
        <Text style={styles.macroStatus}>{status}</Text>
      </View>;
    })}
    {incomplete > 0 && <Text style={styles.macroNote}>{incomplete + ' alimento(s) sin macros completos o con cantidad distinta de gramos; el total mostrado puede ser parcial.'}</Text>}
    {pending > 0 && <Text style={styles.macroNote}>{pending + ' alimento(s) pendiente(s) de registrar; los totales incluyen solo cantidades consumidas.'}</Text>}
    <View style={styles.macroSuggestions}>
      <Text style={styles.macroSuggestionTitle}>Porciones de referencia (ingresa lo que consumiste)</Text>
      {items.map(item => {
        const completed = meal.referencias_completadas?.[item.key] ?? null;
        const minimum = Math.round(item.target.minimum * share);
        if (!completed && totals[item.key] >= minimum) return null;
        const portion = completed ?? macroPortionSuggestion(item.key, minimum - totals[item.key]);
        const amount = drafts[item.key] ?? String(portion.cantidad);
        return <View key={item.key} style={styles.referenceItem}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(completed), disabled: busy || !canMark }} disabled={busy || !canMark} onPress={() => completed ? onToggleReference(meal.id_comida, item.key, null) : savePortion(item.key, portion)}>
            <View style={styles.referenceRow}><View style={[styles.referenceCheck, completed && styles.referenceCheckComplete]}><Text style={styles.referenceCheckText}>{completed ? '✓' : ''}</Text></View><Text style={styles.macroNote}>{(completed ? 'Completada: ' : 'Marcar como completa: ') + referencePortionLabel(item.key, portion)}</Text></View>
          </Pressable>
          <FormField label={'Cantidad ingerida (' + portion.unidad + ')'} value={amount} onChangeText={value => { setDrafts(current => ({ ...current, [item.key]: value })); setErrors(current => ({ ...current, [item.key]: '' })); }} keyboardType="decimal-pad" editable={!busy && canMark} />
          {completed && <Pressable accessibilityRole="button" disabled={busy || !canMark} onPress={() => savePortion(item.key, portion)}><Text style={styles.link}>Guardar cantidad actualizada</Text></Pressable>}
          {!!errors[item.key] && <Text style={styles.referenceError}>{errors[item.key]}</Text>}
        </View>;
      })}
      {!canMark && <Text style={styles.macroNote}>Solo puedes marcar o cambiar porciones de comidas de hoy.</Text>}
      <Text style={styles.macroNote}>El aporte aproximado de las porciones marcadas se suma a los macros de esta comida.</Text>
    </View>
  </View>;
}
function MealFoodConsumption({ food, onSave, onDelete }: { food: MealFood; onSave: (id: number, amount: number, unit: FoodUnit) => Promise<void>; onDelete: () => void }) {
  const [amount, setAmount] = useState(food.cantidad_consumida == null ? '' : String(food.cantidad_consumida));
  const [unit, setUnit] = useState<FoodUnit>(food.unidad_consumida ?? food.unidad_medida);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    const parsed = Number(amount.replace(',', '.'));
    if (!amount.trim() || !Number.isFinite(parsed) || parsed < 0) { setError('Ingresa una cantidad válida, incluyendo 0 si no consumiste el alimento.'); return; }
    setBusy(true);
    setError('');
    try { await onSave(food.id_detalle, parsed, unit); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el consumo.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.consumedFood}>
    <View style={styles.foodLine}><Text style={[styles.body, styles.grow]}>{food.nombre}</Text><Pressable accessibilityRole="button" onPress={onDelete}><Text style={styles.delete}>Quitar</Text></Pressable></View>
    <Text style={styles.foodRecommendation}>Recomendado: {food.cantidad} {foodUnits.find(item => item.value === food.unidad_medida)?.label}</Text>
    <FormField label="Cantidad que realmente consumiste" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Ej. 120" editable={!busy} />
    <ChoiceChips options={foodUnits} value={unit} onChange={setUnit} />
    <FormButton label="Guardar cantidad consumida" secondary onPress={() => { void save(); }} busy={busy} />
    {!!error && <FormNotice>{error}</FormNotice>}
  </View>;
}

function MealFoodPicker({ selectedFood, amount, unit, busy, onAmountChange, onUnitChange, onSelect, onClose, onAttach }: {
  selectedFood: FoodSelection | null; amount: string; unit: FoodUnit; busy: boolean;
  onAmountChange: (value: string) => void; onUnitChange: (value: FoodUnit) => void;
  onSelect: (food: FoodSelection) => void; onClose: () => void; onAttach: () => void;
}) {
  return <View style={styles.addFoodPanel}>
    <View style={styles.row}><Text style={styles.label}>Elegir alimento para esta comida</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.link}>Cerrar</Text></Pressable></View>
    <FoodCatalog selectable selectedId={selectedFood && 'id_alimento' in selectedFood ? selectedFood.id_alimento ?? null : null} selectedName={selectedFood?.nombre} onSelect={onSelect} allowCreate />
    <FormField label="Cantidad recomendada" value={amount} onChangeText={onAmountChange} keyboardType="decimal-pad" />
    {selectedFood?.cantidad_sugerida_g != null && <Text style={styles.body}>Porción sugerida: {selectedFood.cantidad_sugerida_g} g. Puedes modificarla.</Text>}
    <ChoiceChips options={foodUnits} value={unit} onChange={onUnitChange} />
    {selectedFood && <FormButton label={`Agregar ${selectedFood.nombre} al plan`} onPress={onAttach} busy={busy} />}
  </View>;
}

export default function PlannerScreen() {
  const { user } = useAuth();
  const calorieRange = user ? estimateDailyCalories(user) : null;
  const macroTargets = estimateMacroTargets(calorieRange);
  const today = dateText(new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateText(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const viewFrom = rangeMode ? rangeStart ?? selectedDate : selectedDate;
  const viewTo = rangeMode && rangeEnd ? rangeEnd : viewFrom;
  const monthTitle = calendarMonth.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  const firstOffset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarDays: (number | null)[] = [...Array.from({ length: firstOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const [planName, setPlanName] = useState('Mi plan del día');
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
  function chooseRangeDate(date: string) {
    setError(''); setSuccess('');
    if (!rangeStart || rangeEnd) { setRangeStart(date); setRangeEnd(null); }
    else if (date < rangeStart) { setRangeStart(date); setRangeEnd(null); }
    else setRangeEnd(date);
  }
  function chooseCalendarDate(date: string) {
    if (!rangeMode) { setSelectedDate(date); return; }
    chooseRangeDate(date);
  }
  function openFoodPicker(mealId: number) {
    setActiveMeal(mealId); setSelectedFood(null); setAmount('100'); setUnit('g'); setError('');
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getPlans(viewFrom, viewTo).then(data => { if (active) setPlans(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus planes.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, viewFrom, viewTo, reload]);

  async function makePlan() {
    if (rangeMode && (!rangeStart || !rangeEnd)) { setError('Selecciona la fecha inicial y final del rango.'); return; }
    const from = rangeMode ? rangeStart! : selectedDate;
    const to = rangeMode ? rangeEnd! : selectedDate;
    setBusy(true); setError('');
    try { await createPlan({ nombre_plan: planName, fecha_inicio: from, fecha_fin: to, observaciones: notes || null }); setPlanName(''); setNotes(''); setReload(n => n + 1); }
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
    try { const date = rangeMode ? rangeStart ?? selectedDate : selectedDate; const boundedDate = date < plan.fecha_inicio ? plan.fecha_inicio : date > plan.fecha_fin ? plan.fecha_fin : date; const result = await createMeal(plan.id_plan, { tipo_comida: mealKind, fecha: boundedDate, hora: null }); openFoodPicker(result.id_comida); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar la comida.'); }
    finally { setBusy(false); }
  }
  async function generateMealRange(plan: MealPlan) {
    const from = rangeMode ? rangeStart : selectedDate;
    const to = rangeMode ? rangeEnd : selectedDate;
    if (!from || !to) { setError('Selecciona primero la fecha de inicio y la fecha final.'); return; }
    if (from < plan.fecha_inicio || to > plan.fecha_fin) { setError('El intervalo seleccionado debe quedar dentro de las fechas de este plan.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await generateMeals(plan.id_plan, { fecha_inicio: from, fecha_fin: to });
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
  async function saveFoodConsumption(id: number, quantity: number, selectedUnit: FoodUnit) {
    await updateMealFoodConsumption(id, { cantidad_consumida: quantity, unidad_consumida: selectedUnit });
    setReload(n => n + 1);
  }
  async function toggleReferencePortion(meal: MealPlan['comidas'][number], key: MacroKey, portion: Pick<ReferencePortion, 'cantidad' | 'unidad'> | null) {
    const updated: Partial<Record<MacroKey, Pick<ReferencePortion, 'cantidad' | 'unidad'>>> = {};
    for (const macro of ['proteinas', 'carbohidratos', 'grasas'] as const) {
      const current = meal.referencias_completadas?.[macro];
      if (current) updated[macro] = { cantidad: current.cantidad, unidad: current.unidad };
    }
    if (portion) updated[key] = portion;
    else delete updated[key];
    setBusy(true); setError('');
    try {
      const result = await updateMealReferencePortions(meal.id_comida, updated);
      setPlans(current => current.map(plan => ({
        ...plan,
        comidas: plan.comidas.map(item => item.id_comida === meal.id_comida
          ? { ...item, referencias_completadas: result.referencias_completadas }
          : item),
      })));
      setPendingDashboardDate(meal.fecha);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la porción de referencia.'); }
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

  return <MealScreen title="Planifica tu día." subtitle="Consulta una fecha o crea un rango de días.">
    <AccountGate>
            <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.monthArrow}>{'‹'}</Text></Pressable>
          <Text style={styles.monthTitle}>{monthTitle.charAt(0).toLocaleUpperCase('es') + monthTitle.slice(1)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.monthArrow}>{'›'}</Text></Pressable>
        </View>
        <Text style={styles.selectedDateLabel}>{rangeMode ? 'Selecciona inicio y fin del rango' : 'Comidas del ' + new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        {rangeMode && <Text style={styles.rangeDates}>{formatRangeDate(rangeStart)} {'→'} {formatRangeDate(rangeEnd)}</Text>}
        <View style={styles.calendarGrid}>
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, index) => <View key={'weekday-' + index} style={styles.calendarCell}><Text style={styles.weekday}>{day}</Text></View>)}
          {calendarDays.map((day, index) => {
            if (day == null) return <View key={'blank-' + index} style={styles.calendarCell} />;
            const date = dateText(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
            const start = date === rangeStart;
            const end = date === rangeEnd;
            const selected = rangeMode ? start || end : date === selectedDate;
            const inRange = !!rangeMode && !!rangeStart && !!rangeEnd && date >= rangeStart && date <= rangeEnd;
            return <Pressable key={date} accessibilityRole="button" accessibilityLabel={new Date(date + 'T12:00:00').toLocaleDateString('es-GT', { dateStyle: 'full' })} accessibilityState={{ selected }} onPress={() => chooseCalendarDate(date)} style={[styles.calendarCell, styles.calendarDay, inRange && styles.calendarDayInRange, selected && styles.calendarDaySelected]}><Text style={[styles.dayNumber, selected && styles.dayNumberSelected]}>{day}</Text></Pressable>;
          })}
        </View>
        <FormButton label={rangeMode ? 'Cancelar selección de rango' : 'Planificar varias fechas'} secondary onPress={() => { if (rangeMode) { setRangeMode(false); setRangeStart(null); setRangeEnd(null); } else { setRangeMode(true); setRangeStart(selectedDate); setRangeEnd(null); } }} />
      </View>
      <View style={styles.card}><Text style={styles.sectionTitle}>{rangeMode ? 'Crear un plan para el intervalo' : 'Crear un plan para este día'}</Text><FormField label="Nombre del plan" value={planName} onChangeText={setPlanName} maxLength={150} editable={!busy} /><FormField label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} /><FormButton label={rangeMode ? 'Guardar plan para el intervalo' : 'Guardar plan para este día'} onPress={() => { void makePlan(); }} busy={busy} /></View>
      {!!error && <FormNotice>{error}</FormNotice>}
      {!!success && <FormNotice tone="success">{success}</FormNotice>}
      {loading ? <ActivityIndicator accessibilityLabel="Cargando planes" color={palette.green} /> : plans.length === 0 ? <View style={styles.card}><Text style={styles.body}>{rangeMode ? "No hay planes para el rango seleccionado." : "No hay planes para " + formatDate(selectedDate) + "."}</Text></View> : plans.map(plan => <View key={plan.id_plan} style={styles.card}>
        {editing === plan.id_plan ? <><FormField label="Nombre del plan" value={editName} onChangeText={setEditName} maxLength={150} /><FormField label="Fecha inicial (AAAA-MM-DD)" value={editFrom} onChangeText={setEditFrom} maxLength={10} /><FormField label="Fecha final (AAAA-MM-DD)" value={editTo} onChangeText={setEditTo} maxLength={10} /><FormField label="Notas" value={editNotes} onChangeText={setEditNotes} multiline maxLength={2000} /><FormButton label="Guardar cambios" onPress={() => { void savePlan(plan); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditing(null)} /></> : <><View style={styles.row}><View style={styles.grow}><Text style={styles.sectionTitle}>{plan.nombre_plan}</Text><Text style={styles.body}>{formatDate(plan.fecha_inicio)} – {formatDate(plan.fecha_fin)}</Text></View><Pressable accessibilityRole="button" onPress={() => { setEditing(plan.id_plan); setEditName(plan.nombre_plan); setEditFrom(plan.fecha_inicio); setEditTo(plan.fecha_fin); setEditNotes(plan.observaciones ?? ''); }}><Text style={styles.link}>Editar</Text></Pressable></View>{plan.observaciones && <Text style={styles.body}>{plan.observaciones}</Text>}
        {plan.comidas.map(meal => <View key={meal.id_comida} style={styles.meal}><View style={styles.row}><View style={styles.grow}><Text style={styles.mealTitle}>{mealTypes.find(item => item.value === meal.tipo_comida)?.label ?? meal.tipo_comida}</Text><Text style={styles.body}>{formatDate(meal.fecha)}{meal.hora ? ` · ${meal.hora}` : ''}</Text><MealCalories meal={meal} range={calorieRange} /></View><Pressable accessibilityRole="button" onPress={() => setEditingMeal({ id: meal.id_comida, type: meal.tipo_comida, date: meal.fecha, time: meal.hora ?? '' })}><Text style={styles.link}>Editar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDeleteMeal(plan.nombre_plan, meal.id_comida)}><Text style={styles.delete}>Eliminar</Text></Pressable></View><MealMacroDetail meal={meal} targets={macroTargets} onToggleReference={(_id, key, portion) => { void toggleReferencePortion(meal, key, portion); }} busy={busy} canMark={meal.fecha === today} /><Pressable accessibilityRole="button" onPress={() => openFoodPicker(meal.id_comida)}><Text style={styles.link}>Agregar alimentos a esta comida</Text></Pressable>{editingMeal?.id === meal.id_comida && <View style={styles.editMeal}><ChoiceChips options={mealTypes} value={editingMeal.type} onChange={type => setEditingMeal(value => value && ({ ...value, type }))} /><FormField label="Fecha (AAAA-MM-DD)" value={editingMeal.date} onChangeText={date => setEditingMeal(value => value && ({ ...value, date }))} maxLength={10} /><FormField label="Hora (opcional, HH:MM)" value={editingMeal.time} onChangeText={time => setEditingMeal(value => value && ({ ...value, time }))} maxLength={5} /><FormButton label="Guardar comida" onPress={() => { void saveMeal(); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditingMeal(null)} /></View>}{meal.alimentos.map(food => <MealFoodConsumption key={food.id_detalle} food={food} onSave={saveFoodConsumption} onDelete={() => { void deleteMealFood(food.id_detalle).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); }} />)}{activeMeal === meal.id_comida && <MealFoodPicker selectedFood={selectedFood} amount={amount} unit={unit} busy={busy} onAmountChange={setAmount} onUnitChange={setUnit} onSelect={selectFood} onClose={() => { setActiveMeal(null); setSelectedFood(null); }} onAttach={() => { void attachFood(); }} />}</View>)}
        <Text style={styles.label}>Generar comidas para {rangeMode ? 'cada día del rango' : formatDate(selectedDate)}</Text><FormButton label={rangeMode ? "Crear desayuno, almuerzo y cena cada día del rango" : "Crear desayuno, almuerzo y cena de este día"} secondary onPress={() => { void generateMealRange(plan); }} busy={busy} /><Text style={styles.label}>Agregar una comida manual para {formatDate(rangeMode ? rangeStart ?? selectedDate : selectedDate)}</Text><ChoiceChips options={mealTypes} value={mealKind} onChange={setMealKind} /><FormButton label="Crear comida" secondary onPress={() => { void addMeal(plan); }} busy={busy} /><FormButton label="Eliminar plan" danger onPress={() => confirmDeletePlan(plan)} />
        </>}
      </View>)}
</AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({
  calendarCard: { padding: 16, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 12 }, calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft }, monthArrow: { color: palette.green, fontSize: 27, lineHeight: 30 }, monthTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' }, selectedDateLabel: { color: palette.green, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }, rangeDates: { color: palette.green, fontSize: 15, fontWeight: '800' }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, calendarCell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' }, weekday: { color: palette.muted, fontSize: 12, fontWeight: '700' }, calendarDay: { borderRadius: 13 }, calendarDayInRange: { backgroundColor: palette.greenSoft }, calendarDaySelected: { backgroundColor: palette.green }, dayNumber: { color: palette.ink, fontSize: 14, fontWeight: '700' }, dayNumberSelected: { color: '#FFFFFF' },  card: { padding: 20, gap: 15, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }, sectionTitle: { fontSize: 19, fontWeight: '700', color: palette.ink }, body: { fontSize: 14, lineHeight: 21, color: palette.muted }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1 }, link: { color: palette.green, fontSize: 14, fontWeight: '700', padding: 6 }, delete: { color: '#A72E2E', fontSize: 13, fontWeight: '600', padding: 6 }, meal: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14, gap: 10 }, mealTitle: { fontSize: 16, fontWeight: '700', color: palette.ink, textTransform: 'capitalize' }, foodLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, consumedFood: { padding: 12, gap: 9, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.background }, addFoodPanel: { padding: 14, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: palette.green, backgroundColor: palette.surface }, foodRecommendation: { color: palette.green, fontSize: 12, fontWeight: '700' }, label: { color: palette.ink, fontSize: 14, fontWeight: '600' }, calorieSummary: { marginTop: 4, gap: 3 }, calorieGoal: { color: palette.green, fontSize: 12, fontWeight: '700' }, calorieTotal: { color: palette.ink, fontSize: 12, fontWeight: '600' }, calorieHint: { color: palette.muted, fontSize: 11, lineHeight: 16 }, editMeal: { padding: 14, gap: 12, backgroundColor: palette.background, borderRadius: 14 },
  macroPanel: { marginTop: 8, padding: 13, gap: 11, borderRadius: 14, backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border }, macroPanelTitle: { color: palette.ink, fontSize: 12, fontWeight: '800' }, macroProgress: { gap: 4 }, macroLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }, macroName: { color: palette.ink, fontSize: 12, fontWeight: '700' }, macroAmount: { color: palette.green, fontSize: 11, fontWeight: '700' },  macroStatus: { color: palette.muted, fontSize: 10 }, macroNote: { color: palette.muted, fontSize: 11, lineHeight: 16 }, macroSuggestions: { gap: 5, paddingTop: 5, borderTopWidth: 1, borderTopColor: palette.border }, referenceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 }, referenceItem: { gap: 5, paddingVertical: 5 }, referenceError: { color: '#A72E2E', fontSize: 11 },  referenceCheck: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: palette.green }, referenceCheckComplete: { backgroundColor: palette.green }, referenceCheckText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },  macroSuggestionTitle: { color: palette.ink, fontSize: 12, fontWeight: '800' },
});
