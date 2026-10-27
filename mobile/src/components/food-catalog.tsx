import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createFood, getFoods, resolveExternalFood, scanNutritionLabel, searchOpenFoodFacts, searchUsdaFoods, type ExternalFood, type Food, type FoodSelection } from '@/services/meal-planner';
import { palette } from '@/constants/design';
import { FormButton, FormField, FormNotice } from '@/components/form-controls';

type Props = { selectable?: boolean; selectedId?: number | null; selectedName?: string; onSelect?: (food: FoodSelection) => void; allowCreate?: boolean };

export function FoodCatalog({ selectable = false, selectedId = null, selectedName, onSelect, allowCreate = false }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const barcodeHandled = useRef(false);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [externalFoods, setExternalFoods] = useState<ExternalFood[]>([]);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiError, setApiError] = useState('');
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
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [importingId, setImportingId] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const search = query.trim();
    if (search.length < 2) return () => { active = false; controller.abort(); };
    const timer = setTimeout(() => {
      setLoading(true); setError(''); setApiError('');
      const barcodeSearch = /^\d{8,14}$/.test(search);
      const requests = [
        getFoods(search, controller.signal),
        barcodeSearch ? searchOpenFoodFacts(search, controller.signal) : searchUsdaFoods(search, controller.signal),
      ] as const;
      Promise.allSettled(requests).then(([localResult, externalResult]) => {
        if (!active) return;
        if (localResult.status === 'fulfilled') setFoods(localResult.value);
        else setError(localResult.reason instanceof Error ? localResult.reason.message : 'No se pudo consultar el catálogo guardado.');
        if (externalResult.status === 'fulfilled') setExternalFoods(Array.isArray(externalResult.value) ? externalResult.value : [externalResult.value]);
        else setApiError(externalResult.reason instanceof Error ? externalResult.reason.message : 'No se pudo consultar la fuente nutricional.');
      }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, retry]);

  async function importSelectedFood(food: ExternalFood) {
    setError(''); setApiError(''); setImportingId(food.source_id);
    try {
      const resolved = await resolveExternalFood({ source: food.source, source_id: food.source_id });
      setResultsCollapsed(true);
      onSelect?.(resolved);
    } catch (cause) { setApiError(cause instanceof Error ? cause.message : 'No se pudo preparar el alimento.'); }
    finally { setImportingId(''); }
  }

  function selectStoredFood(food: Food) {
    setResultsCollapsed(true);
    onSelect?.(food);
  }

  async function openBarcodeScanner() {
    setBarcodeError('');
    try {
      const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permission.granted) {
        setBarcodeError('Para escanear, permite el acceso a la cámara. También puedes escribir el código de barras en el campo.');
        if (!permission.canAskAgain && Platform.OS !== 'web') {
          Alert.alert('Permiso de cámara desactivado', 'Activa el permiso de cámara para Meal Planner en los ajustes del dispositivo.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
          ]);
        }
        return;
      }
      barcodeHandled.current = false;
      setScanningBarcode(true);
    } catch {
      setBarcodeError('No se pudo acceder a la cámara. Revisa los permisos del dispositivo o escribe el código de barras.');
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (barcodeHandled.current) return;
    const code = result.data.trim();
    if (!/^\d{8,14}$/.test(code)) {
      barcodeHandled.current = true;
      setScanningBarcode(false);
      setBarcodeError('El código leído no es un código de barras de producto válido. Intenta de nuevo.');
      return;
    }
    barcodeHandled.current = true;
    setScanningBarcode(false);
    setBarcodeError('');
    setFoods([]); setExternalFoods([]); setError(''); setApiError('');
    setQuery(code);
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

  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.title}>Catálogo de alimentos</Text>
    {allowCreate && <Pressable accessibilityRole="button" accessibilityState={{ expanded: adding }} onPress={() => { setAdding(value => !value); setFoodError(''); }} style={styles.manualButton}><Text style={styles.manualPlus}>{adding ? '×' : '+'}</Text><Text style={styles.manualButtonText}>{adding ? 'Cerrar' : 'Agregar manualmente'}</Text></Pressable>}
    {adding && <View style={styles.card}><Text style={styles.food}>Ingreso manual</Text><Text style={styles.body}>También puedes leer la tabla nutricional desde una foto. Verifica los valores antes de guardar.</Text><View style={styles.scanActions}><FormButton label="Tomar foto" secondary onPress={() => { void scanLabel('camera'); }} busy={scanning || foodBusy} /><FormButton label="Elegir foto" secondary onPress={() => { void scanLabel('library'); }} busy={scanning || foodBusy} /></View>{!!scanMessage && <FormNotice tone="info">{scanMessage}</FormNotice>}<FormField label="Nombre del alimento" value={foodName} onChangeText={setFoodName} maxLength={150} editable={!foodBusy && !scanning} /><FormField label="Categoría (opcional)" value={category} onChangeText={setCategory} maxLength={80} editable={!foodBusy && !scanning} /><FormField label="Calorías por 100 g (opcional)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Proteínas por 100 g (g, opcional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Carbohidratos por 100 g (g, opcional)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Grasas por 100 g (g, opcional)" value={fats} onChangeText={setFats} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><Text style={styles.body}>Agrega solo valores nutricionales que hayas verificado.</Text>{!!foodError && <FormNotice>{foodError}</FormNotice>}<FormButton label="Guardar alimento" onPress={() => { void addFood(); }} busy={foodBusy || scanning} /></View>}

    <TextInput accessibilityLabel="Buscar alimentos en el catálogo y en las fuentes nutricionales" placeholder="Buscar alimento o escribir código de barras" placeholderTextColor={palette.muted} value={query} onChangeText={value => { setQuery(value); setFoods([]); setExternalFoods([]); setResultsCollapsed(false); setLoading(false); setError(''); setApiError(''); }} maxLength={150} style={styles.search} />
    <Text style={styles.attribution}>Busca en tu catálogo y USDA por nombre; para productos empacados, escribe su código de barras.</Text>
    <FormButton label="Escanear código de barras" secondary onPress={() => { void openBarcodeScanner(); }} />
    {!!barcodeError && <FormNotice>{barcodeError}</FormNotice>}
    {scanningBarcode && <View style={styles.cameraCard}>
      <View style={styles.cameraFrame}>
        <CameraView
          style={styles.cameraPreview}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'] }}
          onBarcodeScanned={handleBarcodeScanned}
          onMountError={event => { setScanningBarcode(false); setBarcodeError(`No se pudo iniciar la cámara: ${event.message}`); }}
        />
        <View pointerEvents="none" style={styles.scanOverlay}><View style={styles.scanTarget} /></View>
      </View>
      <Text style={styles.body}>Centra el código de barras dentro del recuadro.</Text>
      <FormButton label="Cancelar escaneo" secondary onPress={() => { setScanningBarcode(false); }} />
    </View>}
    {loading && <ActivityIndicator accessibilityLabel="Consultando alimentos" color={palette.green} />}
    {!!error && <FormNotice>{error}</FormNotice>}
    {!!apiError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{apiError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Reintentar búsqueda</Text></Pressable></View>}
    {resultsCollapsed && <View style={styles.selectedSummary}><View style={styles.selectedSummaryText}><Text style={styles.selectLabel}>Alimento seleccionado</Text><Text style={styles.food}>{selectedName ?? foods.find(food => food.id_alimento === selectedId)?.nombre ?? 'Listo para agregar'}</Text></View><Pressable accessibilityRole="button" onPress={() => setResultsCollapsed(false)}><Text style={styles.changeLink}>Cambiar</Text></Pressable></View>}
    {!resultsCollapsed && foods.length > 0 && <Text style={styles.groupTitle}>Guardados en mi catálogo</Text>}
    {!resultsCollapsed && foods.length ? foods.map(food => {
      const content = <View style={[styles.foodCard, selectedId === food.id_alimento && styles.selected]}><Text style={styles.food}>{food.nombre}</Text>{food.categoria && <Text style={styles.body}>{food.categoria}</Text>}<Text style={styles.body}>{food.calorias_por_100g == null ? 'Información nutricional por completar' : `${food.calorias_por_100g} kcal por 100 g`}</Text>{selectable && <Text style={styles.selectLabel}>{selectedId === food.id_alimento ? 'Seleccionado' : 'Toca para seleccionar'}</Text>}</View>;
      return selectable ? <Pressable key={food.id_alimento} accessibilityRole="button" accessibilityState={{ selected: selectedId === food.id_alimento }} onPress={() => selectStoredFood(food)}>{content}</Pressable> : <View key={food.id_alimento}>{content}</View>;
    }) : null}
    {!resultsCollapsed && externalFoods.length > 0 && <Text style={styles.groupTitle}>{/^\d{8,14}$/.test(query.trim()) ? 'Productos encontrados por código de barras' : 'Resultados de USDA FoodData Central'}</Text>}
    {!resultsCollapsed && externalFoods.map(food => <ExternalFoodCard key={`${food.source}:${food.source_id}`} food={food} importing={importingId === food.source_id} onUse={() => { void importSelectedFood(food); }} selectable={selectable} allowCreate={allowCreate} />)}
    {!resultsCollapsed && !loading && !error && !apiError && query.trim().length >= 2 && foods.length === 0 && externalFoods.length === 0 && <Text style={styles.body}>No encontramos coincidencias. Puedes agregar el alimento manualmente.</Text>}
    {!query.trim() && <Text style={styles.body}>Escribe al menos 2 caracteres para buscar alimentos o un código de barras.</Text>}
    {!!externalFoods.length && !resultsCollapsed && <Text style={styles.attribution}>{/^\d{8,14}$/.test(query.trim()) ? 'Datos colaborativos de Open Food Facts; pueden estar incompletos.' : 'Fuente: USDA FoodData Central.'}</Text>}
  </View>;
}

function ExternalFoodCard({ food, importing, onUse, selectable, allowCreate }: { food: ExternalFood; importing: boolean; onUse: () => void; selectable: boolean; allowCreate: boolean }) {
  const values = [`${food.calorias_por_100g ?? '—'} kcal`, `P ${food.proteinas ?? '—'} g`, `C ${food.carbohidratos ?? '—'} g`, `G ${food.grasas ?? '—'} g`];
  return <View style={styles.foodCard}><Text style={styles.food}>{food.nombre}</Text>{food.categoria && <Text style={styles.body}>{food.categoria}</Text>}<Text style={styles.body}>{values.join(' · ')} por 100 g</Text><Text style={styles.selectLabel}>{food.source === 'usda' ? 'USDA FoodData Central' : 'Open Food Facts'}</Text>{(selectable || allowCreate) && <FormButton label={importing ? 'Agregando…' : selectable ? 'Agregar y seleccionar' : 'Agregar al catálogo'} onPress={onUse} busy={importing} />}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 14 }, scanActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: palette.ink, fontWeight: '700', fontSize: 21, flexShrink: 1 }, manualButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: palette.border }, manualPlus: { color: palette.green, fontSize: 19, fontWeight: '700', lineHeight: 21 }, manualButtonText: { color: palette.green, fontSize: 13, fontWeight: '700' },
  search: { minHeight: 50, padding: 14, backgroundColor: palette.surface, color: palette.ink, borderColor: palette.border, borderWidth: 1, borderRadius: 14, fontSize: 16 },
  card: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 }, cameraCard: { padding: 14, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 }, cameraFrame: { height: 270, overflow: 'hidden', borderRadius: 12, backgroundColor: '#171A18' }, cameraPreview: { flex: 1 }, scanOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, scanTarget: { width: '82%', height: 100, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 14 }, foodCard: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 8 }, selected: { borderColor: palette.green, backgroundColor: palette.greenSoft }, selectedSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, backgroundColor: palette.greenSoft, borderColor: palette.green, borderWidth: 1 }, selectedSummaryText: { flex: 1, gap: 4 }, changeLink: { color: palette.green, fontWeight: '700', fontSize: 14 }, selectLabel: { fontSize: 12, color: palette.green, fontWeight: '700' },
  food: { fontSize: 17, fontWeight: '600', color: palette.ink }, body: { fontSize: 14, lineHeight: 22, color: palette.muted }, attribution: { fontSize: 12, lineHeight: 18, color: palette.muted }, groupTitle: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 4 },
  retry: { alignSelf: 'flex-start', paddingVertical: 12, paddingRight: 16 }, retryText: { fontWeight: '600', color: palette.green },
});
