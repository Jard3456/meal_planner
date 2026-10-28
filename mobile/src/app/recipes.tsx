import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountGate, ChoiceChips, FormButton, FormField, FormNotice } from '@/components/form-controls';
import { MealScreen } from '@/components/meal-screen';
import { palette } from '@/constants/design';
import { useAuth } from '@/context/auth-context';
import { consumeRecipe, createRecipe, deleteRecipe, getConsumptions, getDashboard, getRecipes, updateRecipe, type Dashboard, type Recipe } from '@/services/meal-planner';
import { setPendingDashboardDate } from '@/services/dashboard-refresh';
import { estimateDailyCalories, estimateMacroTargets } from '@/utils/calorie-estimate';

type MealChoice = 'desayuno' | 'almuerzo' | 'cena';
type LocalRecipe = { id: string; nombre: string; calorias: number; proteinas: number; carbohidratos: number; grasas: number; ingredientes: string[]; preparacion: string[] };
const mealChoices: { value: MealChoice; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' }, { value: 'almuerzo', label: 'Almuerzo' }, { value: 'cena', label: 'Cena' },
];
const localRecipes: Record<MealChoice, LocalRecipe[]> = {
  desayuno: [
    { id: 'breakfast-oat-pancakes', nombre: 'Panqueques de avena y huevo', calorias: 390, proteinas: 22, carbohidratos: 48, grasas: 12, ingredientes: ['½ taza de avena molida', '1 huevo y 1 clara', '½ banano', '¼ taza de leche', 'Canela'], preparacion: ['Tritura la avena hasta que tenga textura de harina y machaca el banano con un tenedor.', 'Bate el huevo con la clara y la leche. Añade la avena, el banano y la canela; mezcla hasta que no queden partes secas.', 'Calienta una sartén antiadherente a fuego medio. Vierte porciones pequeñas y cocina hasta que aparezcan burbujas en la superficie.', 'Voltea cada panqueque y cocina el otro lado de 1 a 2 minutos. Sirve tibio con fruta si deseas.'] },
    { id: 'breakfast-yogurt-papaya', nombre: 'Yogur con papaya y semillas', calorias: 340, proteinas: 18, carbohidratos: 52, grasas: 7, ingredientes: ['1 taza de yogur natural', '1 taza de papaya en cubos', '¼ taza de granola', '1 cucharadita de semillas de chía'], preparacion: ['Lava la papaya, retira las semillas y corta la pulpa en cubos pequeños.', 'Coloca el yogur en un tazón y distribuye la papaya encima.', 'Añade la granola y las semillas de chía justo antes de comer para conservar su textura.', 'Mezcla al servir. Si prefieres una opción menos dulce, usa yogur natural sin azúcar.'] },
    { id: 'breakfast-quesadilla', nombre: 'Quesadilla de huevo y espinaca', calorias: 410, proteinas: 23, carbohidratos: 43, grasas: 15, ingredientes: ['2 tortillas de maíz', '2 huevos', '½ taza de espinaca', '25 g de queso fresco', '1 tomate pequeño'], preparacion: ['Lava la espinaca y pícala en tiras. Bate los huevos y desmenuza el queso.', 'Cocina la espinaca en una sartén caliente durante un minuto. Agrega el huevo y revuelve hasta que esté cocido.', 'Reparte el huevo y el queso sobre una tortilla, cubre con la otra y calienta por ambos lados hasta dorar.', 'Corta en triángulos y acompaña con el tomate picado.'] },
    { id: 'breakfast-oats', nombre: 'Avena con banano y yogur', calorias: 370, proteinas: 17, carbohidratos: 55, grasas: 9, ingredientes: ['½ taza de avena', '¾ taza de yogur natural', '1 banano', 'Canela al gusto'], preparacion: ['Coloca la avena y el yogur en un recipiente. Mezcla hasta que toda la avena quede humedecida.', 'Déjala reposar 15 minutos para suavizarla. Para una textura más cremosa, cúbrela y refrigérala desde la noche anterior.', 'Si queda muy espesa, incorpora una o dos cucharadas de leche o agua poco a poco hasta lograr la consistencia que prefieras.', 'Pela el banano y córtalo en rodajas delgadas. Puedes machacar algunas para endulzar y dejar otras para cubrir.', 'Añade la fruta y una pizca de canela justo antes de servir. Prueba y ajusta la mezcla a tu gusto.'] },
    { id: 'breakfast-eggs', nombre: 'Huevos con frijoles y tortilla', calorias: 350, proteinas: 20, carbohidratos: 34, grasas: 13, ingredientes: ['2 huevos', '½ taza de frijoles cocidos', '2 tortillas de maíz', '1 tomate pequeño', '1 cucharadita de aceite'], preparacion: ['Lava el tomate, córtalo en cubos pequeños y bate los huevos en un recipiente hasta integrar claras y yemas.', 'Calienta el aceite en una sartén a fuego medio. Agrega el tomate y cocínalo de 2 a 3 minutos, moviendo hasta que empiece a suavizarse.', 'Vierte los huevos batidos sobre el tomate. Revuelve lentamente con una espátula durante 3 o 4 minutos, hasta que estén completamente cocidos.', 'Calienta los frijoles en una olla pequeña con una cucharada de agua para evitar que se peguen. Revuelve de vez en cuando.', 'Calienta las tortillas en un comal o sartén seco durante unos segundos por lado. Sirve los huevos con los frijoles y las tortillas calientes.'] },
    { id: 'breakfast-toast', nombre: 'Tostadas con aguacate y queso', calorias: 330, proteinas: 11, carbohidratos: 31, grasas: 18, ingredientes: ['2 rebanadas de pan integral', '½ aguacate', '30 g de queso fresco', '1 cucharadita de jugo de limón'], preparacion: ['Tuesta el pan en una tostadora o sartén seca durante 2 o 3 minutos por lado, hasta que quede dorado y crujiente.', 'Corta el aguacate por la mitad, retira la semilla y saca la pulpa con una cuchara.', 'Machaca la pulpa con un tenedor y mezcla el jugo de limón. Déjala con algunos trozos si prefieres una textura rústica.', 'Unta el aguacate sobre las tostadas procurando cubrirlas hasta las orillas.', 'Desmenuza el queso fresco encima y sirve de inmediato para conservar lo crujiente del pan.'] },
  ],
  almuerzo: [
    { id: 'lunch-tilapia-potato', nombre: 'Tilapia con papa y ensalada', calorias: 460, proteinas: 38, carbohidratos: 50, grasas: 12, ingredientes: ['150 g de filete de tilapia', '1 papa mediana', '1 taza de lechuga y tomate', '1 cucharadita de aceite', 'Limón y especias'], preparacion: ['Lava la papa y cuécela en agua hasta que un tenedor pueda atravesarla con facilidad; córtala en trozos.', 'Sazona la tilapia con limón, pimienta y una pizca de sal.', 'Calienta el aceite en una sartén y cocina el pescado de 3 a 4 minutos por lado, hasta que se desmenuce fácilmente.', 'Sirve con la papa y una ensalada fresca de lechuga y tomate.'] },
    { id: 'lunch-lentil-bowl', nombre: 'Tazón de lentejas y vegetales', calorias: 430, proteinas: 23, carbohidratos: 68, grasas: 8, ingredientes: ['¾ taza de lentejas cocidas', '½ taza de arroz cocido', '½ zanahoria', '½ tomate', '1 cucharada de cilantro'], preparacion: ['Lava la zanahoria y el tomate; pícalos en cubos pequeños.', 'Calienta las lentejas en una olla con un poco de agua y agrega la zanahoria para que se suavice.', 'Incorpora el tomate y cocina unos minutos más. Ajusta la sazón al gusto.', 'Sirve las lentejas sobre el arroz y termina con cilantro picado.'] },
    { id: 'lunch-beef-beans', nombre: 'Carne salteada con frijoles', calorias: 520, proteinas: 36, carbohidratos: 58, grasas: 17, ingredientes: ['120 g de carne magra en tiras', '½ taza de frijoles negros cocidos', '2 tortillas de maíz', '½ chile pimiento', '¼ de cebolla'], preparacion: ['Corta la carne en tiras delgadas y rebana la cebolla y el chile pimiento.', 'Calienta una sartén y cocina la carne hasta que se dore y quede bien cocida.', 'Agrega la cebolla y el chile; saltea de 3 a 4 minutos para que queden suaves pero firmes.', 'Calienta los frijoles y las tortillas. Sirve junto a la carne y los vegetales.'] },
    { id: 'lunch-chicken', nombre: 'Pollo con arroz y vegetales', calorias: 480, proteinas: 45, carbohidratos: 55, grasas: 8, ingredientes: ['120 g de pechuga de pollo', '¾ taza de arroz cocido', '½ taza de zanahoria', '½ taza de brócoli', '1 cucharadita de aceite'], preparacion: ['Si el arroz aún no está cocido, prepáralo siguiendo las indicaciones del empaque y mantenlo tapado.', 'Lava la zanahoria y el brócoli. Córtalos en trozos parecidos para que se cocinen de manera uniforme.', 'Seca el pollo con papel de cocina. Calienta el aceite a fuego medio y cocina el pollo aproximadamente de 5 a 7 minutos por lado, según su grosor, hasta que esté completamente cocido.', 'Cuece los vegetales al vapor de 5 a 7 minutos. Deben quedar suaves, pero conservar algo de firmeza.', 'Deja reposar el pollo 2 minutos y córtalo en tiras. Sírvelo con el arroz y los vegetales; sazona al gusto.'] },
    { id: 'lunch-beans', nombre: 'Tazón de frijoles con arroz', calorias: 420, proteinas: 17, carbohidratos: 70, grasas: 8, ingredientes: ['½ taza de frijoles cocidos', '¾ taza de arroz cocido', '½ tomate', '¼ de cebolla', '1 cucharada de cilantro'], preparacion: ['Pica el tomate y la cebolla en cubos pequeños. Lava y pica el cilantro, y mézclalo todo para una salsa fresca.', 'Coloca los frijoles en una olla pequeña con una o dos cucharadas de agua. Caliéntalos de 3 a 5 minutos a fuego medio y revuelve para que no se peguen.', 'Calienta el arroz tapado hasta que esté caliente por completo. Si está seco, agrega una cucharadita de agua.', 'Coloca el arroz como base en un tazón y distribuye encima los frijoles calientes.', 'Termina con la mezcla de tomate, cebolla y cilantro. Prueba y ajusta la sazón antes de servir.'] },
    { id: 'lunch-tuna', nombre: 'Pasta con atún y tomate', calorias: 480, proteinas: 34, carbohidratos: 65, grasas: 8, ingredientes: ['75 g de pasta seca', '1 lata pequeña de atún escurrido', '1 tomate', '¼ de cebolla', '1 cucharadita de aceite'], preparacion: ['Llena una olla con agua y llévala a hervor. Agrega la pasta y cocínala el tiempo indicado en el empaque, revolviendo una vez.', 'Antes de escurrirla, reserva un par de cucharadas del agua de cocción. Escurre la pasta con cuidado.', 'Pica la cebolla y el tomate. Calienta el aceite a fuego medio y cocina la cebolla durante unos 2 minutos.', 'Añade el tomate y cocina de 4 a 5 minutos, moviendo de vez en cuando, hasta que se ablande y forme una salsa.', 'Incorpora el atún escurrido y sepáralo con un tenedor. Agrega la pasta, mezcla suavemente y calienta todo 1 o 2 minutos antes de servir.'] },
  ],
  cena: [
    { id: 'dinner-chicken-wrap', nombre: 'Tazón de pollo y vegetales', calorias: 360, proteinas: 38, carbohidratos: 25, grasas: 11, ingredientes: ['120 g de pechuga de pollo', '1 taza de lechuga', '½ taza de pepino y tomate', '¼ de aguacate', 'Limón'], preparacion: ['Cocina la pechuga en una sartén a fuego medio hasta que esté bien hecha por dentro y dorada por fuera.', 'Lava y corta la lechuga, el pepino y el tomate. Colócalos en un tazón.', 'Deja reposar el pollo unos minutos y córtalo en tiras para conservar sus jugos.', 'Añade el pollo y el aguacate al tazón; aliña con limón y sazona al gusto.'] },
    { id: 'dinner-tuna-potato', nombre: 'Papa rellena de atún', calorias: 380, proteinas: 33, carbohidratos: 47, grasas: 8, ingredientes: ['1 papa grande', '1 lata pequeña de atún en agua, escurrida', '2 cucharadas de yogur natural', '¼ de cebolla', 'Cilantro'], preparacion: ['Lava la papa y cuécela entera hasta que esté suave. También puedes cocinarla tapada en microondas, revisando su textura.', 'Mezcla el atún escurrido con el yogur, la cebolla finamente picada y el cilantro.', 'Abre la papa caliente a lo largo y separa ligeramente el centro con un tenedor.', 'Rellena con la mezcla de atún y sirve con verduras frescas.'] },
    { id: 'dinner-egg-bean-bowl', nombre: 'Huevos con frijoles y pico de gallo', calorias: 390, proteinas: 23, carbohidratos: 38, grasas: 17, ingredientes: ['2 huevos', '½ taza de frijoles cocidos', '1 tortilla de maíz', '1 tomate', '¼ de cebolla'], preparacion: ['Pica el tomate y la cebolla, mézclalos y reserva el pico de gallo.', 'Calienta los frijoles con una cucharada de agua para que no se peguen.', 'Cocina los huevos en una sartén antiadherente a tu gusto, procurando que queden bien cocidos.', 'Sirve con los frijoles, la tortilla caliente y el pico de gallo.'] },
    { id: 'dinner-omelet', nombre: 'Tortilla de verduras con ensalada', calorias: 310, proteinas: 20, carbohidratos: 15, grasas: 18, ingredientes: ['2 huevos', '½ taza de espinaca', '¼ de chile pimiento', '1 taza de ensalada', '1 cucharadita de aceite'], preparacion: ['Lava y seca la espinaca. Corta el chile pimiento en tiras finas y bate los huevos en un recipiente.', 'Calienta el aceite en una sartén antiadherente a fuego medio. Agrega el chile y cocínalo unos 2 minutos antes de añadir la espinaca.', 'Revuelve las verduras hasta que la espinaca reduzca su volumen. Distribúyelas en una capa pareja.', 'Vierte los huevos batidos, baja el fuego y cocina de 3 a 4 minutos, hasta que la base esté firme. Dobla la tortilla y cocina un minuto más.', 'Lava y pica la ensalada mientras termina la tortilla. Sírvela al lado y añade el aderezo que prefieras.'] },
    { id: 'dinner-soup', nombre: 'Sopa de pollo con verduras', calorias: 330, proteinas: 34, carbohidratos: 36, grasas: 7, ingredientes: ['120 g de pollo', '1 papa pequeña', '½ zanahoria', '½ güisquil', '2 tazas de agua o caldo'], preparacion: ['Lava las verduras. Pela la papa y la zanahoria si lo deseas, y corta todo, incluido el pollo, en trozos parecidos.', 'Coloca el pollo y el agua o caldo en una olla. Lleva a hervor a fuego medio y retira la espuma de la superficie si aparece.', 'Agrega la papa y la zanahoria. Baja el fuego para mantener un hervor suave y cocina alrededor de 10 minutos.', 'Añade el güisquil y cocina de 8 a 10 minutos más, hasta que las verduras estén suaves y el pollo completamente cocido.', 'Prueba el caldo y ajusta la sazón. Reparte pollo y verduras en cada plato y sirve caliente.'] },
    { id: 'dinner-quesadilla', nombre: 'Quesadillas de frijol y queso', calorias: 400, proteinas: 19, carbohidratos: 45, grasas: 15, ingredientes: ['2 tortillas de maíz', '½ taza de frijoles cocidos', '30 g de queso fresco', '½ tomate'], preparacion: ['Machaca los frijoles con un tenedor hasta formar una pasta fácil de untar. Si están secos, incorpora una cucharadita de agua.', 'Extiende los frijoles sobre una tortilla y reparte el queso desmenuzado. Cúbrela con la otra tortilla o dóblala por la mitad.', 'Calienta una sartén seca a fuego medio. Cocina la quesadilla de 2 a 3 minutos por lado, presionando suavemente con una espátula.', 'Retírala cuando las tortillas estén doradas y el queso se haya suavizado. Si el centro sigue frío, calienta un minuto más a fuego bajo.', 'Corta en triángulos y sirve con el tomate picado. Deja que se enfríe un momento antes de comer.'] },
  ],
};
const localDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (name: string) => parts.find(part => part.type === name)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export default function RecipesScreen() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [date, setDate] = useState(localDate);
  const [meal, setMeal] = useState<MealChoice>('desayuno');
  const [dailySummary, setDailySummary] = useState<Dashboard | null>(null);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [consumedRecipeIds, setConsumedRecipeIds] = useState<string[]>([]);
  const [consumingRecipeId, setConsumingRecipeId] = useState<string | null>(null);
  const [consumptionNotice, setConsumptionNotice] = useState('');
  const today = localDate();
  const calorieRange = user ? estimateDailyCalories(user) : null;
  const macroTargets = estimateMacroTargets(calorieRange);
  const selectedDaySummary = dailySummary?.fecha === date ? dailySummary : null;
  const remainingForMeal = (dailyMaximum: number | undefined, alreadyConsumed: number, defaultForMeal: number) => {
    if (dailyMaximum == null) return defaultForMeal;
    const remaining = Math.max(0, dailyMaximum - alreadyConsumed);
    return remaining > 0 ? Math.max(5, Math.min(defaultForMeal, remaining / 3)) : defaultForMeal;
  };
  const mealTargets = {
    calorias: Math.round(remainingForMeal(calorieRange?.maximum, selectedDaySummary?.calorias ?? 0, calorieRange ? calorieRange.estimated / 3 : 450)),
    proteinas: Math.round(remainingForMeal(macroTargets?.proteinas.maximum, selectedDaySummary?.proteinas ?? 0, macroTargets ? (macroTargets.proteinas.minimum + macroTargets.proteinas.maximum) / 6 : 25)),
    carbohidratos: Math.round(remainingForMeal(macroTargets?.carbohidratos.maximum, selectedDaySummary?.carbohidratos ?? 0, macroTargets ? (macroTargets.carbohidratos.minimum + macroTargets.carbohidratos.maximum) / 6 : 50)),
    grasas: Math.round(remainingForMeal(macroTargets?.grasas.maximum, selectedDaySummary?.grasas ?? 0, macroTargets ? (macroTargets.grasas.minimum + macroTargets.grasas.maximum) / 6 : 15)),
  };
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const dayIndex = dateParts
    ? Math.floor((Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])) - Date.UTC(Number(dateParts[1]), 0, 1)) / 86400000)
    : 0;
  const recipesForMeal = localRecipes[meal];
  const rotation = dayIndex % recipesForMeal.length;
  const dailySelection = [...recipesForMeal.slice(rotation), ...recipesForMeal.slice(0, rotation)].slice(0, 3);
  const rankedRecipes = dailySelection.sort((first, second) => {
    const score = (recipe: LocalRecipe) => {
      const pairs: [number, number][] = [
        [recipe.calorias, mealTargets.calorias], [recipe.proteinas, mealTargets.proteinas],
        [recipe.carbohidratos, mealTargets.carbohidratos], [recipe.grasas, mealTargets.grasas],
      ];
      return pairs.reduce((total, [value, target]) => total + Math.abs(value - target) / Math.max(target, 1), 0) / pairs.length;
    };
    return score(first) - score(second);
  });

  useEffect(() => {
    if (!user) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      getRecipes().then(data => { if (active) setRecipes(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus recetas.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [user, reload]);

  useEffect(() => {
    if (!user || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let active = true;
    getDashboard(date).then(data => { if (active) setDailySummary(data); }).catch(() => { if (active) setDailySummary(null); });
    return () => { active = false; };
  }, [user, date]);

  useEffect(() => {
    if (!user || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let active = true;
    getConsumptions(date, date).then(rows => {
      if (active) setConsumedRecipeIds(rows.filter(row => row.food_snapshot?.source === 'recipe').map(row => row.food_snapshot?.source_id ?? '').filter(Boolean));
    }).catch(() => { if (active) setConsumedRecipeIds([]); });
    return () => { active = false; };
  }, [user, date]);

  function reset() { setEditing(null); setName(''); setDescription(''); setInstructions(''); setImageUrl(''); setError(''); setManualOpen(false); }
  function edit(recipe: Recipe) { setEditing(recipe.id_receta); setName(recipe.nombre); setDescription(recipe.descripcion ?? ''); setInstructions(recipe.instrucciones); setImageUrl(recipe.imagen_url ?? ''); setError(''); setManualOpen(true); }
  async function save() {
    setBusy(true); setError('');
    try {
      const data = { nombre: name, descripcion: description || null, instrucciones: instructions, imagen_url: imageUrl || null };
      if (editing) await updateRecipe(editing, data); else await createRecipe(data);
      reset(); setReload(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la receta.'); }
    finally { setBusy(false); }
  }
  function remove(recipe: Recipe) { Alert.alert('Eliminar receta', `¿Eliminar “${recipe.nombre}” de tus recetas guardadas?`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void deleteRecipe(recipe.id_receta).then(() => setReload(n => n + 1)).catch(e => setError(e.message)); } }]); }

  async function markRecipeConsumed(recipe: LocalRecipe) {
    if (date !== today || consumedRecipeIds.includes(recipe.id) || consumingRecipeId) return;
    setConsumingRecipeId(recipe.id); setConsumptionNotice('');
    try {
      const result = await consumeRecipe({ recipe_id: recipe.id, nombre: recipe.nombre, fecha: date, calorias: recipe.calorias, proteinas: recipe.proteinas, carbohidratos: recipe.carbohidratos, grasas: recipe.grasas });
      setConsumedRecipeIds(ids => ids.includes(recipe.id) ? ids : [...ids, recipe.id]);
      setPendingDashboardDate(date);
      setDailySummary(await getDashboard(date));
      setConsumptionNotice(result.already_consumed ? 'Esta receta ya estaba registrada en el consumo de hoy.' : `Registrada: ${recipe.calorias} kcal, ${recipe.proteinas} g de proteína, ${recipe.carbohidratos} g de carbohidratos y ${recipe.grasas} g de grasas.`);
    } catch (e) {
      setConsumptionNotice(e instanceof Error ? e.message : 'No se pudo registrar esta receta.');
    } finally { setConsumingRecipeId(null); }
  }

  function recommendationCard(recipe: LocalRecipe) {
    const expanded = expandedRecipe === recipe.id;
    const macros = [
      { label: 'Proteína', value: recipe.proteinas },
      { label: 'Carbohidratos', value: recipe.carbohidratos },
      { label: 'Grasas', value: recipe.grasas },
    ];
    return <View key={recipe.id} style={styles.recommendation}>
      <Text style={styles.recipeTitle}>{recipe.nombre}</Text>
      {date !== today && <Text style={styles.body}>Solo puedes registrar consumos para hoy.</Text>}
      <FormButton label={consumedRecipeIds.includes(recipe.id) ? 'Consumida hoy' : 'Marcar como consumida'} secondary onPress={() => { void markRecipeConsumed(recipe); }} busy={consumingRecipeId === recipe.id} disabled={date !== today || consumedRecipeIds.includes(recipe.id) || consumingRecipeId !== null} />
      <Text style={styles.nutrients}>{`${recipe.calorias} kcal aproximadas por porción`}</Text>
      <View style={styles.macroGrid}>{macros.map(macro => <View key={macro.label} style={styles.macroRow}><Text style={styles.macroLabel}>{macro.label}</Text><Text style={styles.macroValue}>{macro.value == null ? 'Sin dato' : `${macro.value} g`}</Text></View>)}</View>
      <Text style={styles.macroLabel}>Ingredientes para 1 porción</Text>
      <Text style={styles.body}>{recipe.ingredientes.join(' · ')}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedRecipe(expanded ? null : recipe.id)} style={styles.moreInfoButton}>
        <Text style={styles.moreInfoText}>{expanded ? 'Mostrar menos' : 'Más información'}</Text>
      </Pressable>
      {expanded && <View style={styles.preparation}><Text style={styles.macroLabel}>Preparación detallada</Text>{recipe.preparacion.map((step, index) => <Text key={`${recipe.id}-step-${index}`} style={styles.body}>{`${index + 1}. ${step}`}</Text>)}</View>}
    </View>;
  }

  return <MealScreen title="Ideas que dan gusto." subtitle="Encuentra una recomendación para tu día y conserva tus recetas favoritas.">
    <AccountGate>
      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.title}>Platillos recomendados</Text><Text style={styles.badge}>PARA TI</Text></View>
        <Text style={styles.body}>Sugerencias variadas según la fecha, el tipo de comida y tu meta nutricional estimada.</Text>
        <FormField label="Fecha (AAAA-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-10-27" keyboardType="numbers-and-punctuation" maxLength={10} />
        <Text style={styles.label}>¿Qué comida quieres preparar?</Text>
        <ChoiceChips options={mealChoices} value={meal} onChange={setMeal} />
        {!/^\d{4}-\d{2}-\d{2}$/.test(date) && <FormNotice>Escribe la fecha en formato AAAA-MM-DD.</FormNotice>}
        {calorieRange ? <Text style={styles.target}>{`Meta estimada por comida: ${mealTargets.calorias} kcal · ${mealTargets.proteinas} g proteína · ${mealTargets.carbohidratos} g carbos · ${mealTargets.grasas} g grasa`}</Text> : <FormNotice tone="info">Completa edad, peso, estatura, actividad y objetivo en tu perfil para ordenar mejor las sugerencias.</FormNotice>}
        {selectedDaySummary && <Text style={styles.body}>{`Consumo registrado este día: ${Math.round(selectedDaySummary.calorias)} kcal · ${Math.round(selectedDaySummary.proteinas)} g proteína · ${Math.round(selectedDaySummary.carbohidratos)} g carbos · ${Math.round(selectedDaySummary.grasas)} g grasa.`}</Text>}
        {!!selectedDaySummary?.macros_incompletos && <FormNotice tone="info">Los macros registrados para este día son parciales porque algunos consumos no tienen todos sus datos.</FormNotice>}
        <FormNotice tone="info">Los valores de calorías y macros son aproximados por porción. Revisa las cantidades reales de los ingredientes.</FormNotice>
        {!!consumptionNotice && <FormNotice tone={consumptionNotice.startsWith('Registrada:') || consumptionNotice.startsWith('Esta receta ya') ? 'success' : 'error'}>{consumptionNotice}</FormNotice>}
        {rankedRecipes.map(recommendationCard)}
      </View>

      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.title}>{editing ? 'Editar receta' : 'Tus recetas'}</Text><Pressable accessibilityRole="button" onPress={() => setReload(n => n + 1)}><Text style={styles.link}>Actualizar</Text></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: manualOpen }} onPress={() => setManualOpen(open => !open)} style={styles.manualToggle}>
          <Text style={styles.manualToggleText}>{manualOpen ? '−  Ocultar formulario' : editing ? 'Editar receta' : '+  Agregar receta manualmente'}</Text>
        </Pressable>
        {manualOpen && <View style={styles.form}>
          <FormField label="Nombre de la receta" value={name} onChangeText={setName} maxLength={150} editable={!busy} />
          <FormField label="Descripción (opcional)" value={description} onChangeText={setDescription} multiline maxLength={4000} editable={!busy} />
          <FormField label="Instrucciones" value={instructions} onChangeText={setInstructions} multiline maxLength={10000} editable={!busy} />
          <FormField label="Enlace a imagen (opcional)" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" keyboardType="url" maxLength={2048} editable={!busy} />
          {!!error && <FormNotice>{error}</FormNotice>}
          <View style={styles.actions}><FormButton label={editing ? 'Guardar cambios' : 'Guardar receta'} onPress={() => { void save(); }} busy={busy} />{editing && <FormButton label="Cancelar" secondary onPress={reset} />}</View>
        </View>}
        {!!error && !manualOpen && <FormNotice>{error}</FormNotice>}
        {loading ? <ActivityIndicator accessibilityLabel="Cargando recetas guardadas" color={palette.green} /> : recipes.length === 0 ? <Text style={styles.body}>Todavía no guardas recetas. Usa el botón para agregar una a tu colección.</Text> : recipes.map(recipe => <View key={recipe.id_receta} style={styles.savedRecipe}><Text style={styles.recipeTitle}>{recipe.nombre}</Text>{recipe.descripcion && <Text style={styles.body}>{recipe.descripcion}</Text>}<Text style={styles.body}>{recipe.instrucciones}</Text>{recipe.imagen_url && <Text selectable style={styles.url}>{recipe.imagen_url}</Text>}<View style={styles.actions}><FormButton label="Editar" secondary onPress={() => edit(recipe)} /><FormButton label="Eliminar" danger onPress={() => remove(recipe)} /></View></View>)}
      </View>
    </AccountGate>
  </MealScreen>;
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 20, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, gap: 15 },
  title: { color: palette.ink, fontSize: 19, fontWeight: '700' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { color: palette.green, backgroundColor: palette.greenSoft, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, overflow: 'hidden' },
  label: { color: palette.ink, fontSize: 14, fontWeight: '600' }, body: { color: palette.muted, fontSize: 14, lineHeight: 22 }, target: { color: palette.ink, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  recommendation: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 14, gap: 8 }, recipeTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' }, nutrients: { color: palette.green, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, macroRow: { minWidth: 94, flexGrow: 1, flexBasis: '30%', padding: 10, borderRadius: 12, backgroundColor: palette.greenSoft }, macroLabel: { color: palette.muted, fontSize: 11, fontWeight: '600' }, macroValue: { color: palette.ink, fontSize: 14, fontWeight: '800', marginTop: 3 }, preparation: { gap: 5, marginTop: 4 },
  link: { color: palette.green, fontWeight: '700', paddingVertical: 7 },
  moreInfoButton: { minHeight: 42, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: palette.border }, moreInfoText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  manualToggle: { minHeight: 48, borderRadius: 14, paddingHorizontal: 15, justifyContent: 'center', backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: palette.border }, manualToggleText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  form: { gap: 14, paddingTop: 2 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, savedRecipe: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16, gap: 10 }, url: { color: palette.green, fontSize: 12 },
});
