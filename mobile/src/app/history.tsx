import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, ChoiceChips, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { FoodCatalog } from '@/components/food-catalog';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { createConsumption, deleteConsumption, foodReference, foodUnits, getConsumptions, updateConsumption, type Consumption, type FoodSelection } from '@/services/meal-planner';
import type { FoodUnit } from '@/types/meal-planner';

function dateText(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateText(date); }
function labelDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }); }

export default function HistoryScreen() {
  const { user } = useAuth();
  const today = dateText(new Date());
  const [date, setDate] = useState(() => dateText(new Date()));
  const [items, setItems] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [food, setFood] = useState<FoodSelection | null>(null);
  const [amount, setAmount] = useState('100');
  const [unit, setUnit] = useState<FoodUnit>('g');
  const [calories, setCalories] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getConsumptions(date, date).then(data => { if (active) setItems(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, date, reload]);

  function resetForm() { setFood(null); setAmount('100'); setUnit('g'); setCalories(''); setEditing(null); }
  function selectFood(selected: FoodSelection) {
    setFood(selected);
    if (selected.cantidad_sugerida_g != null) { setAmount(String(selected.cantidad_sugerida_g)); setUnit('g'); setCalories(''); }
  }
  function editItem(item: Consumption) {
    if (item.food_snapshot?.source === 'recipe') return;
    if (item.id_alimento == null && item.food_snapshot) setFood({ ...item.food_snapshot, cantidad_sugerida_g: null });
    else if (item.id_alimento != null) setFood({ id_alimento: item.id_alimento, nombre: item.alimento, categoria: null, calorias_por_100g: null });
    else return;
    setAmount(String(item.cantidad)); setUnit(item.unidad_medida); setCalories(item.calorias_totales == null ? '' : String(item.calorias_totales)); setEditing(item.id_consumo); setError('');
  }
  async function save() {
    if (date !== today) { setError('Solo puedes registrar o modificar consumos del día actual.'); return; }
    if (!food) { setError('Selecciona un alimento del catálogo.'); return; }
    const quantity = Number(amount.replace(',', '.'));
    const kcal = calories.trim() ? Number(calories.replace(',', '.')) : null;
    if (!Number.isFinite(quantity) || quantity <= 0 || (kcal != null && (!Number.isFinite(kcal) || kcal < 0))) { setError('Revisa la cantidad y las calorías.'); return; }
    setBusy(true); setError('');
    try {
      const body = { ...foodReference(food), fecha: date, cantidad: quantity, unidad_medida: unit, calorias_totales: kcal };
      if (editing) await updateConsumption(editing, body); else await createConsumption(body);
      resetForm(); setReload(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el consumo.'); }
    finally { setBusy(false); }
  }
  function remove(item: Consumption) { Alert.alert('Eliminar registro', `¿Eliminar ${item.alimento} del historial?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deleteConsumption(item.id_consumo).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); } }]); }

  return <MealScreen title="Cada día cuenta." subtitle="Registra lo que consumes y consulta tus días anteriores.">
    <AccountGate>
      <View style={styles.dateNav}><Pressable accessibilityRole="button" disabled={busy || editing != null} onPress={() => setDate(value => shiftDate(value, -1))}><Text style={styles.link}>‹ Día anterior</Text></Pressable><Text style={styles.date}>{labelDate(date)}</Text><Pressable accessibilityRole="button" disabled={busy || editing != null || date >= today} onPress={() => setDate(value => shiftDate(value, 1))}><Text style={styles.link}>Día siguiente ›</Text></Pressable></View>
      {date === today ? <View style={styles.card}><Text style={styles.title}>{editing ? 'Editar consumo' : 'Registrar un alimento'}</Text><FoodCatalog selectable selectedId={food && 'id_alimento' in food ? food.id_alimento ?? null : null} selectedName={food?.nombre} onSelect={selectFood} allowCreate /><FormField label="Cantidad" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy} />{food?.cantidad_sugerida_g != null && <Text style={styles.hint}>Porción sugerida: {food.cantidad_sugerida_g} g. Puedes modificarla.</Text>}<ChoiceChips options={foodUnits} value={unit} onChange={setUnit} /><FormField label="Calorías totales (opcional)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" editable={!busy} /><Text style={styles.hint}>Para cantidades en gramos se calculan desde los datos del catálogo cuando están disponibles.</Text>{!!error && <FormNotice>{error}</FormNotice>}<View style={styles.actions}><FormButton label={editing ? 'Guardar cambios' : 'Guardar consumo'} onPress={() => { void save(); }} busy={busy} />{editing && <FormButton label="Cancelar edición" secondary onPress={resetForm} />}</View></View> : <View style={styles.card}><Text style={styles.hint}>Solo puedes registrar alimentos en el día actual. Aquí puedes consultar tus registros anteriores.</Text></View>}
      <View style={styles.card}><View style={styles.row}><Text style={styles.title}>Tu registro del día</Text><Pressable accessibilityRole="button" onPress={() => setReload(n => n + 1)}><Text style={styles.link}>Actualizar</Text></Pressable></View>{loading ? <ActivityIndicator accessibilityLabel="Cargando historial" color={palette.green} /> : items.length === 0 ? <Text style={styles.hint}>No hay consumos registrados para este día.</Text> : items.map(item => <View key={item.id_consumo} style={styles.item}><View style={styles.grow}><Text style={styles.itemTitle}>{item.alimento}</Text><Text style={styles.hint}>{item.cantidad} {foodUnits.find(value => value.value === item.unidad_medida)?.label}{item.calorias_totales == null ? '' : ` · ${item.calorias_totales} kcal`}</Text></View>{date === today && item.food_snapshot?.source !== 'recipe' && <Pressable accessibilityRole="button" onPress={() => editItem(item)}><Text style={styles.link}>Editar</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => remove(item)}><Text style={styles.delete}>Eliminar</Text></Pressable></View>)}</View>
    </AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, date: { textAlign: 'center', color: palette.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize', flex: 1 }, link: { color: palette.green, fontWeight: '700', fontSize: 13, paddingVertical: 8 },
  card: { padding: 20, borderRadius: 20, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 15 }, title: { color: palette.ink, fontSize: 19, fontWeight: '700' }, hint: { color: palette.muted, fontSize: 14, lineHeight: 21 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, item: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }, grow: { flex: 1 }, itemTitle: { color: palette.ink, fontWeight: '700', fontSize: 15 }, delete: { color: '#A72E2E', fontWeight: '600', fontSize: 13, padding: 6 },
});
