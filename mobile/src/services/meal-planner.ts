import { apiRequest } from '@/services/api';
import type { FoodUnit, MealType } from '@/types/meal-planner';

export type Food = { id_alimento: number; nombre: string; categoria: string | null; calorias_por_100g: number | null; proteinas?: number | null; carbohidratos?: number | null; grasas?: number | null; cantidad_sugerida_g?: number | null };
export type ExternalFood = Omit<Food, 'id_alimento'> & { id_alimento?: number; source: 'usda' | 'openfoodfacts'; source_id: string };
export type FoodSelection = Food | ExternalFood;
export type FoodSnapshot = Pick<Food, 'nombre' | 'categoria' | 'calorias_por_100g' | 'proteinas' | 'carbohidratos' | 'grasas'> & { source: 'usda' | 'openfoodfacts'; source_id: string };
export type RecipeConsumptionSnapshot = Pick<Food, 'nombre' | 'categoria' | 'calorias_por_100g' | 'proteinas' | 'carbohidratos' | 'grasas'> & { source: 'recipe'; source_id: string };
export type FoodReference = { id_alimento: number } | { alimento_snapshot: FoodSnapshot };
export function foodReference(food: FoodSelection): FoodReference {
  if ('id_alimento' in food && typeof food.id_alimento === 'number') return { id_alimento: food.id_alimento };
  if ('source' in food) return { alimento_snapshot: { nombre: food.nombre, categoria: food.categoria, calorias_por_100g: food.calorias_por_100g, proteinas: food.proteinas ?? null, carbohidratos: food.carbohidratos ?? null, grasas: food.grasas ?? null, source: food.source, source_id: food.source_id } };
  throw new Error('No se encontró una referencia válida para este alimento.');
}
export type MealFood = { id_detalle: number; id_alimento: number | null; nombre: string; cantidad: number; unidad_medida: FoodUnit; cantidad_consumida: number | null; unidad_consumida: FoodUnit | null; calorias_por_100g: number | null; proteinas: number | null; carbohidratos: number | null; grasas: number | null };
export type MacroKey = 'proteinas' | 'carbohidratos' | 'grasas';
export type ReferencePortion = { alimento: string; cantidad: number; unidad: 'g' | 'cda'; macro_gramos: number; calorias: number };
export type CompletedReferencePortions = Partial<Record<MacroKey, ReferencePortion>>;
export type PlannedMeal = { id_comida: number; tipo_comida: MealType; fecha: string; hora: string | null; referencias_completadas: CompletedReferencePortions | null; alimentos: MealFood[] };
export type MealPlan = { id_plan: number; nombre_plan: string; fecha_inicio: string; fecha_fin: string; observaciones: string | null; comidas: PlannedMeal[] };
export type Consumption = { id_consumo: number; id_alimento: number | null; alimento: string; fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null; food_snapshot?: FoodSnapshot | RecipeConsumptionSnapshot | null };
export type Recipe = { id_receta: number; nombre: string; descripcion: string | null; instrucciones: string; imagen_url: string | null; fecha_creacion?: string };
export type Dashboard = { fecha: string; calorias: number; consumos: number; comidas: number; recetas: number; proteinas: number; carbohidratos: number; grasas: number; macros_incompletos: number };

export const mealTypes: { value: MealType; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' }, { value: 'almuerzo', label: 'Almuerzo' },
  { value: 'cena', label: 'Cena' }, { value: 'snack', label: 'Snack' },
];
export const foodUnits: { value: FoodUnit; label: string }[] = [
  { value: 'g', label: 'g' }, { value: 'ml', label: 'ml' },
  { value: 'porcion', label: 'porción' }, { value: 'unidad', label: 'unidad' },
];

export const getFoods = (query = '', signal?: AbortSignal) => apiRequest<Food[]>(`/foods?q=${encodeURIComponent(query)}`, { signal });
export const searchUsdaFoods = (query: string, signal?: AbortSignal) => apiRequest<ExternalFood[]>(`/foods/search/usda?q=${encodeURIComponent(query)}`, { signal });
export const searchOpenFoodFacts = (barcode: string, signal?: AbortSignal) => apiRequest<ExternalFood>(`/foods/search/openfoodfacts?barcode=${encodeURIComponent(barcode)}`, { signal });
export const resolveExternalFood = (data: Pick<ExternalFood, 'source' | 'source_id'>) => apiRequest<ExternalFood>('/foods/resolve', { method: 'POST', body: JSON.stringify(data) });
export const createFood = (data: Omit<Food, 'id_alimento'> & { proteinas?: number | null; carbohidratos?: number | null; grasas?: number | null }) => apiRequest<Food>('/foods', { method: 'POST', body: JSON.stringify(data) });
export type NutritionLabelScan = { calorias_por_100g: number | null; proteinas: number | null; carbohidratos: number | null; grasas: number | null; serving_grams: number | null; conversion_applied: boolean; review_message: string };
export const scanNutritionLabel = (image: FormData) => apiRequest<NutritionLabelScan>('/foods/scan-label', { method: 'POST', body: image }, 180000);
export const getPlans = (from: string, to: string) => apiRequest<MealPlan[]>(`/plans?from=${from}&to=${to}`);
export const createPlan = (data: Pick<MealPlan, 'nombre_plan' | 'fecha_inicio' | 'fecha_fin' | 'observaciones'>) => apiRequest<MealPlan>('/plans', { method: 'POST', body: JSON.stringify(data) });
export const updatePlan = (id: number, data: Pick<MealPlan, 'nombre_plan' | 'fecha_inicio' | 'fecha_fin' | 'observaciones'>) => apiRequest<MealPlan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlan = (id: number) => apiRequest<void>(`/plans/${id}`, { method: 'DELETE' });
export const createMeal = (planId: number, data: { tipo_comida: MealType; fecha: string; hora: string | null }) => apiRequest<PlannedMeal>(`/plans/${planId}/meals`, { method: 'POST', body: JSON.stringify(data) });
export const generateMeals = (planId: number, data: { fecha_inicio: string; fecha_fin: string }) => apiRequest<{ created_count: number }>(`/plans/${planId}/generate-meals`, { method: 'POST', body: JSON.stringify(data) });
export const updateMeal = (id: number, data: { tipo_comida: MealType; fecha: string; hora: string | null }) => apiRequest<PlannedMeal>(`/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateMealReferencePortions = (id: number, portions: Partial<Record<MacroKey, Pick<ReferencePortion, 'cantidad' | 'unidad'>>> | null) => apiRequest<{ id_comida: number; referencias_completadas: CompletedReferencePortions | null }>(`/meals/${id}/reference-portions`, { method: 'PUT', body: JSON.stringify({ referencias_completadas: portions }) });
export const deleteMeal = (id: number) => apiRequest<void>(`/meals/${id}`, { method: 'DELETE' });
export const addMealFood = (id: number, data: FoodReference & { cantidad: number; unidad_medida: FoodUnit }) => apiRequest<{ id_detalle: number; id_alimento: number | null }>(`/meals/${id}/foods`, { method: 'POST', body: JSON.stringify(data) });
export const deleteMealFood = (id: number) => apiRequest<void>(`/meal-foods/${id}`, { method: 'DELETE' });
export const updateMealFoodConsumption = (id: number, data: { cantidad_consumida: number; unidad_consumida: FoodUnit }) => apiRequest<{ id_detalle: number; cantidad_consumida: number; unidad_consumida: FoodUnit }>(`/meal-foods/${id}/consumption`, { method: 'PUT', body: JSON.stringify(data) });
export const getConsumptions = (from: string, to: string) => apiRequest<Consumption[]>(`/consumptions?from=${from}&to=${to}`);
export const consumeRecipe = (data: { recipe_id: string; nombre: string; fecha: string; calorias: number; proteinas: number; carbohidratos: number; grasas: number }) => apiRequest<Consumption & { already_consumed: boolean }>('/consumptions/recipes', { method: 'POST', body: JSON.stringify(data) });
export const createConsumption = (data: FoodReference & { fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null }) => apiRequest<Consumption>('/consumptions', { method: 'POST', body: JSON.stringify(data) });
export const updateConsumption = (id: number, data: FoodReference & { fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null }) => apiRequest<Consumption>(`/consumptions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteConsumption = (id: number) => apiRequest<void>(`/consumptions/${id}`, { method: 'DELETE' });
export const getRecipes = () => apiRequest<Recipe[]>('/recipes');
export const createRecipe = (data: Omit<Recipe, 'id_receta' | 'fecha_creacion'>) => apiRequest<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(data) });
export const updateRecipe = (id: number, data: Omit<Recipe, 'id_receta' | 'fecha_creacion'>) => apiRequest<Recipe>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRecipe = (id: number) => apiRequest<void>(`/recipes/${id}`, { method: 'DELETE' });
export const getDashboard = (date: string) => apiRequest<Dashboard>(`/dashboard?fecha=${date}`);

