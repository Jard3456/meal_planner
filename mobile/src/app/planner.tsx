import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, ChoiceChips, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { FoodCatalog } from '@/components/food-catalog';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { addMealFood, createMeal, createPlan, deleteMeal, deleteMealFood, deletePlan, foodUnits, getPlans, mealTypes, updateMeal, updatePlan, type Food, type MealPlan } from '@/services/meal-planner';
import type { FoodUnit, MealType } from '@/types/meal-planner';

function dateText(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function mondayOf(date: Date) { const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value; }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateText(date); }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' }); }

export default function PlannerScreen() {
  const { user } = useAuth();
  const [week, setWeek] = useState(() => dateText(mondayOf(new Date())));
  const weekEnd = useMemo(() => shiftDate(week, 6), [week]);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [amount, setAmount] = useState('100');
  const [unit, setUnit] = useState<FoodUnit>('g');
  const [mealKind, setMealKind] = useState<MealType>('desayuno');

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
    try { await createPlan({ nombre_plan: planName, fecha_inicio: week, fecha_fin: weekEnd, observaciones: notes || null }); setPlanName(''); setNotes(''); setReload(n => n + 1); }
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
    try { const date = week < plan.fecha_inicio ? plan.fecha_inicio : week > plan.fecha_fin ? plan.fecha_fin : week; const result = await createMeal(plan.id_plan, { tipo_comida: mealKind, fecha: date, hora: null }); setActiveMeal(result.id_comida); setSelectedFood(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar la comida.'); }
    finally { setBusy(false); }
  }
  async function attachFood() {
    if (!activeMeal || !selectedFood) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Ingresa una cantidad mayor que cero.'); return; }
    setBusy(true); setError('');
    try { await addMealFood(activeMeal, { id_alimento: selectedFood.id_alimento, cantidad: numericAmount, unidad_medida: unit }); setSelectedFood(null); setReload(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar el alimento.'); }
    finally { setBusy(false); }
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
      <View style={styles.week}><Pressable accessibilityRole="button" onPress={() => setWeek(shiftDate(week, -7))} style={styles.weekButton}><Text style={styles.weekButtonText}>‹ Anterior</Text></Pressable><Text style={styles.weekLabel}>{formatDate(week)} – {formatDate(weekEnd)}</Text><Pressable accessibilityRole="button" onPress={() => setWeek(shiftDate(week, 7))} style={styles.weekButton}><Text style={styles.weekButtonText}>Siguiente ›</Text></Pressable></View>
      <View style={styles.card}><Text style={styles.sectionTitle}>Crear un plan semanal</Text><FormField label="Nombre del plan" value={planName} onChangeText={setPlanName} maxLength={150} editable={!busy} /><FormField label="Notas (opcional)" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} /><FormButton label="Guardar plan" onPress={() => { void makePlan(); }} busy={busy} /></View>
      {!!error && <FormNotice>{error}</FormNotice>}
      {loading ? <ActivityIndicator accessibilityLabel="Cargando planes" color={palette.green} /> : plans.length === 0 ? <View style={styles.card}><Text style={styles.body}>Aún no hay planes para esta semana. Crea uno para empezar.</Text></View> : plans.map(plan => <View key={plan.id_plan} style={styles.card}>
        {editing === plan.id_plan ? <><FormField label="Nombre del plan" value={editName} onChangeText={setEditName} maxLength={150} /><FormField label="Fecha inicial (AAAA-MM-DD)" value={editFrom} onChangeText={setEditFrom} maxLength={10} /><FormField label="Fecha final (AAAA-MM-DD)" value={editTo} onChangeText={setEditTo} maxLength={10} /><FormField label="Notas" value={editNotes} onChangeText={setEditNotes} multiline maxLength={2000} /><FormButton label="Guardar cambios" onPress={() => { void savePlan(plan); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditing(null)} /></> : <><View style={styles.row}><View style={styles.grow}><Text style={styles.sectionTitle}>{plan.nombre_plan}</Text><Text style={styles.body}>{formatDate(plan.fecha_inicio)} – {formatDate(plan.fecha_fin)}</Text></View><Pressable accessibilityRole="button" onPress={() => { setEditing(plan.id_plan); setEditName(plan.nombre_plan); setEditFrom(plan.fecha_inicio); setEditTo(plan.fecha_fin); setEditNotes(plan.observaciones ?? ''); }}><Text style={styles.link}>Editar</Text></Pressable></View>{plan.observaciones && <Text style={styles.body}>{plan.observaciones}</Text>}
        {plan.comidas.map(meal => <View key={meal.id_comida} style={styles.meal}><View style={styles.row}><View style={styles.grow}><Text style={styles.mealTitle}>{mealTypes.find(item => item.value === meal.tipo_comida)?.label ?? meal.tipo_comida}</Text><Text style={styles.body}>{formatDate(meal.fecha)}{meal.hora ? ` · ${meal.hora}` : ''}</Text></View><Pressable accessibilityRole="button" onPress={() => setEditingMeal({ id: meal.id_comida, type: meal.tipo_comida, date: meal.fecha, time: meal.hora ?? '' })}><Text style={styles.link}>Editar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => confirmDeleteMeal(plan.nombre_plan, meal.id_comida)}><Text style={styles.delete}>Eliminar</Text></Pressable></View>{editingMeal?.id === meal.id_comida && <View style={styles.editMeal}><ChoiceChips options={mealTypes} value={editingMeal.type} onChange={type => setEditingMeal(value => value && ({ ...value, type }))} /><FormField label="Fecha (AAAA-MM-DD)" value={editingMeal.date} onChangeText={date => setEditingMeal(value => value && ({ ...value, date }))} maxLength={10} /><FormField label="Hora (opcional, HH:MM)" value={editingMeal.time} onChangeText={time => setEditingMeal(value => value && ({ ...value, time }))} maxLength={5} /><FormButton label="Guardar comida" onPress={() => { void saveMeal(); }} busy={busy} /><FormButton label="Cancelar" secondary onPress={() => setEditingMeal(null)} /></View>}{meal.alimentos.map(food => <View key={food.id_detalle} style={styles.foodLine}><Text style={[styles.body, styles.grow]}>{food.nombre} · {food.cantidad} {foodUnits.find(item => item.value === food.unidad_medida)?.label}</Text><Pressable accessibilityRole="button" onPress={() => { void deleteMealFood(food.id_detalle).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); }}><Text style={styles.delete}>Quitar</Text></Pressable></View>)}</View>)}
        <Text style={styles.label}>Agregar una comida</Text><ChoiceChips options={mealTypes} value={mealKind} onChange={setMealKind} /><FormButton label="Crear comida" secondary onPress={() => { void addMeal(plan); }} busy={busy} /><FormButton label="Eliminar plan" danger onPress={() => confirmDeletePlan(plan)} />
        </>}
      </View>)}
      {activeMeal != null && <View style={styles.card}><View style={styles.row}><Text style={styles.sectionTitle}>Agregar alimentos a la comida</Text><Pressable accessibilityRole="button" onPress={() => { setActiveMeal(null); setSelectedFood(null); }}><Text style={styles.link}>Cerrar</Text></Pressable></View><FoodCatalog selectable selectedId={selectedFood?.id_alimento} onSelect={setSelectedFood} allowCreate /><FormField label="Cantidad" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><ChoiceChips options={foodUnits} value={unit} onChange={setUnit} />{selectedFood && <FormButton label={`Agregar ${selectedFood.nombre}`} onPress={() => { void attachFood(); }} busy={busy} />}</View>}
    </AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }, weekButton: { paddingVertical: 10 }, weekButtonText: { color: palette.green, fontWeight: '700', fontSize: 13 }, weekLabel: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  card: { padding: 20, gap: 15, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }, sectionTitle: { fontSize: 19, fontWeight: '700', color: palette.ink }, body: { fontSize: 14, lineHeight: 21, color: palette.muted }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, grow: { flex: 1 }, link: { color: palette.green, fontSize: 14, fontWeight: '700', padding: 6 }, delete: { color: '#A72E2E', fontSize: 13, fontWeight: '600', padding: 6 }, meal: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14, gap: 10 }, mealTitle: { fontSize: 16, fontWeight: '700', color: palette.ink, textTransform: 'capitalize' }, foodLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, label: { color: palette.ink, fontSize: 14, fontWeight: '600' }, editMeal: { padding: 14, gap: 12, backgroundColor: palette.background, borderRadius: 14 },
});
