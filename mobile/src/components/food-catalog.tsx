import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createFood, getFoods, scanNutritionLabel, type Food } from '@/services/meal-planner';
import { palette } from '@/constants/design';
import { FormButton, FormField, FormNotice } from '@/components/form-controls';

type Props = { selectable?: boolean; selectedId?: number | null; onSelect?: (food: Food) => void; allowCreate?: boolean };

export function FoodCatalog({ selectable = false, selectedId = null, onSelect, allowCreate = false }: Props) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
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
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getFoods(query.trim(), controller.signal)
        .then(data => { if (active) setFoods(data); })
        .catch(error => { if (active && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudo consultar.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, retry]);

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
      setScanning(true);
      const asset = result.assets[0];
      const form = new FormData();
      if (Platform.OS === 'web') {
        const image = await fetch(asset.uri).then(response => response.blob());
        form.append('image', image, 'nutrition-label.jpg');
      } else {
        form.append('image', { uri: asset.uri, name: 'nutrition-label.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      }
      const scan = await scanNutritionLabel(form);
      setCalories(scan.calorias_por_100g == null ? '' : String(scan.calorias_por_100g));
      setProtein(scan.proteinas == null ? '' : String(scan.proteinas));
      setCarbs(scan.carbohidratos == null ? '' : String(scan.carbohidratos));
      setFats(scan.grasas == null ? '' : String(scan.grasas));
      setScanMessage(scan.review_message);
    } catch (error) {
      setFoodError(error instanceof Error ? error.message : 'No se pudo leer la etiqueta.');
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
    } catch (error) { setFoodError(error instanceof Error ? error.message : 'No se pudo guardar el alimento.'); }
    finally { setFoodBusy(false); }
  }

  return <View style={styles.section}>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>Catálogo de alimentos</Text>{allowCreate && <Pressable accessibilityRole="button" onPress={() => { setAdding(value => !value); setFoodError(''); }}><Text style={styles.addLink}>{adding ? 'Cerrar' : '＋ Agregar'}</Text></Pressable>}</View>
    {adding && <View style={styles.card}><Text style={styles.food}>Lee la tabla nutricional desde una foto</Text><Text style={styles.body}>La lectura sugiere valores para 100 g. Verifícalos antes de guardar.</Text><View style={styles.scanActions}><FormButton label="Tomar foto" secondary onPress={() => { void scanLabel('camera'); }} busy={scanning || foodBusy} /><FormButton label="Elegir foto" secondary onPress={() => { void scanLabel('library'); }} busy={scanning || foodBusy} /></View>{!!scanMessage && <FormNotice tone="info">{scanMessage}</FormNotice>}<FormField label="Nombre del alimento" value={foodName} onChangeText={setFoodName} maxLength={150} editable={!foodBusy && !scanning} /><FormField label="Categoría (opcional)" value={category} onChangeText={setCategory} maxLength={80} editable={!foodBusy && !scanning} /><FormField label="Calorías por 100 g (opcional)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Proteínas por 100 g (g, opcional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Carbohidratos por 100 g (g, opcional)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><FormField label="Grasas por 100 g (g, opcional)" value={fats} onChangeText={setFats} keyboardType="decimal-pad" editable={!foodBusy && !scanning} /><Text style={styles.body}>Agrega solo valores nutricionales que hayas verificado.</Text>{!!foodError && <FormNotice>{foodError}</FormNotice>}<FormButton label="Guardar alimento" onPress={() => { void addFood(); }} busy={foodBusy || scanning} /></View>}
    <TextInput accessibilityLabel="Buscar alimentos" placeholder="Buscar por nombre" placeholderTextColor={palette.muted} value={query} onChangeText={setQuery} maxLength={150} style={styles.search} />
    {loading ? <ActivityIndicator accessibilityLabel="Consultando alimentos" color={palette.green} /> : error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Intentar de nuevo</Text></Pressable></View> : foods.length ? foods.map(food => {
      const content = <View style={[styles.foodCard, selectedId === food.id_alimento && styles.selected]}><Text style={styles.food}>{food.nombre}</Text>{food.categoria && <Text style={styles.body}>{food.categoria}</Text>}<Text style={styles.body}>{food.calorias_por_100g == null ? 'Información nutricional por completar' : `${food.calorias_por_100g} kcal por 100 g`}</Text>{selectable && <Text style={styles.selectLabel}>{selectedId === food.id_alimento ? 'Seleccionado' : 'Toca para seleccionar'}</Text>}</View>;
      return selectable ? <Pressable key={food.id_alimento} accessibilityRole="button" accessibilityState={{ selected: selectedId === food.id_alimento }} onPress={() => onSelect?.(food)}>{content}</Pressable> : <View key={food.id_alimento}>{content}</View>;
    }) : <Text style={styles.body}>{query.trim() ? 'No encontramos alimentos con ese nombre.' : 'Todavía no hay alimentos registrados en el catálogo.'}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 14 }, scanActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, title: { color: palette.ink, fontWeight: '700', fontSize: 21 }, addLink: { color: palette.green, fontSize: 14, fontWeight: '700' },
  search: { minHeight: 50, padding: 14, backgroundColor: palette.surface, color: palette.ink, borderColor: palette.border, borderWidth: 1, borderRadius: 14, fontSize: 16 },
  card: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 12 }, foodCard: { padding: 18, borderRadius: 16, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 6 }, selected: { borderColor: palette.green, backgroundColor: palette.greenSoft }, selectLabel: { fontSize: 12, color: palette.green, fontWeight: '700' },
  food: { fontSize: 17, fontWeight: '600', color: palette.ink }, body: { fontSize: 14, lineHeight: 22, color: palette.muted },
  retry: { alignSelf: 'flex-start', paddingVertical: 12, paddingRight: 16 }, retryText: { fontWeight: '600', color: palette.green },
});
