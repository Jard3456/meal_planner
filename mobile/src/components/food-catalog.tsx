import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createFood, getFoods, importExternalFood, scanNutritionLabel, searchOpenFoodFacts, searchUsdaFoods, type ExternalFood, type Food } from '@/services/meal-planner';
import { palette } from '@/constants/design';
import { FormButton, FormField, FormNotice } from '@/components/form-controls';

type Props = { selectable?: boolean; selectedId?: number | null; onSelect?: (food: Food) => void; allowCreate?: boolean };
type SearchMode = 'catalog' | 'usda' | 'barcode';

export function FoodCatalog({ selectable = false, selectedId = null, onSelect, allowCreate = false }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('catalog');
  const [foods, setFoods] = useState<Food[]>([]);
  const [externalFoods, setExternalFoods] = useState<ExternalFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [adding, setAdding] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [category, setCategory] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [foodError, setFoodError] = useState('');
  const [foodBusy, setFoodBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [importingId, setImportingId] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (mode === 'barcode') return () => { active = false; controller.abort(); };
    const search = query.trim();
    if (search.length < 2) return () => { active = false; controller.abort(); };
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      const request = mode === 'catalog' ? getFoods(search, controller.signal) : searchUsdaFoods(search, controller.signal);
      request.then(data => {
        if (!active) return;
        if (mode === 'catalog') setFoods(data as Food[]);
        else setExternalFoods(data as ExternalFood[]);
      }).catch(cause => {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar.');
      }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [mode, query, retry]);

  async function lookupBarcode() {
    setError(''); setExternalFoods([]); setBarcodeBusy(true);
    try { setExternalFoods([await searchOpenFoodFacts(query.trim())]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el código.'); }
    finally { setBarcodeBusy(false); }
  }

  async function importSelectedFood(food: ExternalFood) {
    setError(''); setImportingId(food.source_id);
    try {
      const saved = await importExternalFood({ source: food.source, source_id: food.source_id });
      setFoods(current => current.some(item => item.id_alimento === saved.id_alimento) ? current : [saved, ...current]);
      onSelect?.(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo agregar el alimento.'); }
    finally { setImportingId(''); }
  }

  async function scanLabel(source: 'camera' | 'library') {
    setFoodError(''); setScanMessage(''); setScanning(true);
    try {
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.85 };
      if (Platform.OS !== 'web') {
        const permission = source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          const resource = source === 'camera' ? 'cámara' : 'fotos';
          if (!permission.canAskAgain) {
            Alert.alert(`Permiso de ${resource} desactivado`, `Activa el permiso de ${resource} para Meal Planner en los ajustes del dispositivo.`, [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
            ]);
          } else setFoodError(`Permite el acceso a ${resource} para continuar.`);
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const scale = Math.min(1, 1800 / Math.max(asset.width, asset.height));
      const width = Math.max(1, Math.round(asset.width * scale));
      const height = Math.max(1, Math.round(asset.height * scale));
      const optimized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width, height } }], { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
      const form = new FormData();
      if (Platform.OS === 'web') {
        const image = await fetch(optimized.uri).then(response => response.blob());
        form.append('image', image, 'nutrition-label.jpg');
      } else form.append('image', new File(optimized.uri), 'nutrition-label.jpg');
      const scan = await scanNutritionLabel(form);
      setCalories(scan.calorias_por_100g == null ? '' : String(scan.calorias_por_100g));
      setProtein(scan.proteinas == null ? '' : String(scan.proteinas));
      setCarbs(scan.carbohidratos == null ? '' : String(scan.carbohidratos));
      setFats(scan.grasas == null ? '' : String(scan.grasas));
      setScanMessage(scan.review_message);
    } catch (cause) {
      setFoodError(cause instanceof Error ? cause.message : 'No se pudo leer la etiqueta.');
    } finally { setScanning(false); }
  }

  async function addFood() {
    setFoodBusy(true); setFoodError('');
    const parseNutrition = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
    const parsedCalories = parseNutrition(calories); const parsedProtein = parseNutrition(protein); const parsedCarbs = parseNutrition(carbs); const parsedFats = parseNutrition(fats);
    if ([parsedCalories, parsedProtein, parsedCarbs, parsedFats].some(value => value != null && (!Number.isFinite(value) || value < 0)) || [parsedProtein, parsedCarbs, parsedFats].some(value => value != null && value > 100)) {
      setFoodError('Revisa los valores nutricionales. Los macronutrientes deben estar entre 0 y 100 g por 100 g.'); setFoodBusy(false); return;
    }
    try {
      const food = await createFood({ nombre: foodName, categoria: category || null, calorias_por_100g: parsedCalories, proteinas: parsedProtein, carbohidratos: parsedCarbs, grasas: parsedFats });
      setFoodName(''); setCategory(''); setCalories(''); setProtein(''); setCarbs(''); setFats(''); setScanMessage(''); setAdding(false); setRetry(value => value + 1); onSelect?.(food);
    } catch (cause) { setFoodError(cause instanceof Error ? cause.message : 'No se pudo guardar el alimento.'); }
    finally { setFoodBusy(false); }
  }

  const modes: { value: SearchMode; label: string }[] = [{ value: 'catalog', label: 'Mi catálogo' }, { value: 'usda', label: 'USDA' }, { value: 'barcode', label: 'Código de barras' }];
  return <View style={styles.section}>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>Catálogo de alimentos</Text>{allowCreate && <Pressable accessibilityRole="button" onPress={() => { setAdding(value => !value); setFoodError(''); }}><Text style={styles.addLink}>{adding ? 'Cerrar' : '＋ Agregar manual'}</Text></Pressable>}</View>
    {adding && <View style={styles.card}><Text style={styles.food}>Ingreso manual</Text><Text style={styles.body}>También puedes leer la tabla nutricional desde una foto. Verifica los valores antes de guardar.</Text><View style={styles.scanActions}><FormButton label="Tomar foto" secondary onPress={() => { void scanLabel('camera'); }} busy={scanning || foodBusy} /><FormButton label="Elegir foto" secondary onPress={() => { void scanLabel('library'); }} busy={scanning || foodBusy} /></View>{!!scanMessage && <FormNotice tone="info">{scanMessage}</FormNotice>}<FormField label="Nombre del alimento" value={foodName} onChangeText={setFoodName} maxLength={150} editable={!foodBusy && !scanning} /><FormField label="Categoría (opcional)" value={category} onChangeText={setCategory} maxLength={80} editable={!foodBusy && !scanning} /><FormField label="Calorías por 100 g (opcional)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Proteínas por 100 g (g, opcional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Carbohidratos por 100 g (g, opcional)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Grasas por 100 g (g, opcional)" value={fats} onChangeText={setFats} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><Text style={styles.body}>Agrega solo valores nutricionales que hayas verificado.</Text>{!!foodError && <FormNotice>{foodError}</FormNotice>}<FormButton label="Guardar alimento" onPress={() => { void addFood(); }} busy={foodBusy || scanning} /></View>}

    <View accessibilityRole="tablist" style={styles.modeRow}>{modes.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: mode === option.value }} onPress={() => { setMode(option.value); setQuery(''); setFoods([]); setExternalFoods([]); setLoading(false); setError(''); }} style={[styles.modeButton, mode === option.value && styles.modeSelected]}><Text style={[styles.modeText, mode === option.value && styles.modeTextSelected]}>{option.label}</Text></Pressable>)}</View>
    <TextInput accessibilityLabel={mode === 'barcode' ? 'Código de barras del producto' : 'Buscar alimentos'} placeholder={mode === 'barcode' ? 'Escribe el código de barras' : mode === 'usda' ? 'Buscar alimentos por nombre' : 'Buscar en mi catálogo'} placeholderTextColor={palette.muted} value={query} onChangeText={value => { setQuery(value); setFoods([]); setExternalFoods([]); setLoading(false); setError(''); }} maxLength={mode === 'barcode' ? 14 : 150} keyboardType={mode === 'barcode' ? 'number-pad' : 'default'} style={styles.search} />
    {mode === 'barcode' && <><Text style={styles.body}>Consulta productos empacados en Open Food Facts. Ingresa un código de barras de 8 a 14 dígitos y pulsa buscar.</Text><FormButton label="Buscar producto" onPress={() => { void lookupBarcode(); }} busy={barcodeBusy} /></>}
    {loading || barcodeBusy ? <ActivityIndicator accessibilityLabel="Consultando alimentos" color={palette.green} /> : error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{error}</Text><Pressable accessibilityRole="button" onPress={() => mode === 'barcode' ? void lookupBarcode() : setRetry(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Intentar de nuevo</Text></Pressable></View> : mode === 'barcode' || mode === 'usda' ? externalFoods.length ? externalFoods.map(food => <ExternalFoodCard key={`${food.source}:${food.source_id}`} food={food} importing={importingId === food.source_id} onUse={() => { void importSelectedFood(food); }} selectable={selectable} allowCreate={allowCreate} />) : <Text style={styles.body}>{mode === 'barcode' ? 'Busca un producto con su código de barras.' : query.trim().length >= 2 ? 'No encontramos alimentos con ese nombre.' : 'Escribe al menos 2 caracteres para buscar en USDA FoodData Central.'}</Text> : foods.length ? foods.map(food => {
      const content = <View style={[styles.foodCard, selectedId === food.id_alimento && styles.selected]}><Text style={styles.food}>{food.nombre}</Text>{food.categoria && <Text style={styles.body}>{food.categoria}</Text>}<Text style={styles.body}>{food.calorias_por_100g == null ? 'Información nutricional por completar' : `${food.calorias_por_100g} kcal por 100 g`}</Text>{selectable && <Text style={styles.selectLabel}>{selectedId === food.id_alimento ? 'Seleccionado' : 'Toca para seleccionar'}</Text>}</View>;
      return selectable ? <Pressable key={food.id_alimento} accessibilityRole="button" accessibilityState={{ selected: selectedId === food.id_alimento }} onPress={() => onSelect?.(food)}>{content}</Pressable> : <View key={food.id_alimento}>{content}</View>;
    }) : <Text style={styles.body}>{query.trim() ? 'No encontramos alimentos con ese nombre.' : 'Todavía no hay alimentos registrados en el catálogo.'}</Text>}
    {mode === 'barcode' && <Text style={styles.attribution}>Datos colaborativos de Open Food Facts. Algunos productos pueden no tener todos sus nutrientes.</Text>}
    {mode === 'usda' && <Text style={styles.attribution}>Fuente: USDA FoodData Central.</Text>}
  </View>;
}

function ExternalFoodCard({ food, importing, onUse, selectable, allowCreate }: { food: ExternalFood; importing: boolean; onUse: () => void; selectable: boolean; allowCreate: boolean }) {
  const values = [`${food.calorias_por_100g ?? '—'} kcal`, `P ${food.proteinas ?? '—'} g`, `C ${food.carbohidratos ?? '—'} g`, `G ${food.grasas ?? '—'} g`];
  return <View style={styles.foodCard}><Text style={styles.food}>{food.nombre}</Text>{food.categoria && <Text style={styles.body}>{food.categoria}</Text>}<Text style={styles.body}>{values.join(' · ')} por 100 g</Text><Text style={styles.selectLabel}>{food.source === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts'}</Text>{(selectable || allowCreate) && <FormButton label={importing ? 'Agregando…' : selectable ? 'Agregar y seleccionar' : 'Agregar al catálogo'} onPress={onUse} busy={importing} />}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 14 }, scanActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: palette.ink, fontWeight: '700', fontSize: 21 }, addLink: { color: palette.green, fontSize: 14, fontWeight: '700' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, modeButton: { borderRadius: 999, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: palette.surface }, modeSelected: { backgroundColor: palette.greenSoft, borderColor: palette.green }, modeText: { color: palette.muted, fontWeight: '600', fontSize: 13 }, modeTextSelected: { color: palette.green },
  search: { minHeight: 50, padding: 14, backgroundColor: palette.surface, color: palette.ink, borderColor: palette.border, borderWidth: 1, borderRadius: 14, fontSize: 16 },
  card: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 }, foodCard: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 8 }, selected: { borderColor: palette.green, backgroundColor: palette.greenSoft }, selectLabel: { fontSize: 12, color: palette.green, fontWeight: '700' },
  food: { fontSize: 17, fontWeight: '600', color: palette.ink }, body: { fontSize: 14, lineHeight: 22, color: palette.muted }, attribution: { fontSize: 12, lineHeight: 18, color: palette.muted },
  retry: { alignSelf: 'flex-start', paddingVertical: 12, paddingRight: 16 }, retryText: { fontWeight: '600', color: palette.green },
});
