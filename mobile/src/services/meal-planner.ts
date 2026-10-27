import { apiRequest } from '@/services/api';
import type { FoodUnit, MealType } from '@/types/meal-planner';

export type Food = { id_alimento: number; nombre: string; categoria: string | null; calorias_por_100g: number | null; proteinas?: number | null; carbohidratos?: number | null; grasas?: number | null };
export type MealFood = { id_detalle: number; id_alimento: number; nombre: string; cantidad: number; unidad_medida: FoodUnit; calorias_por_100g: number | null };
export type PlannedMeal = { id_comida: number; tipo_comida: MealType; fecha: string; hora: string | null; alimentos: MealFood[] };
export type MealPlan = { id_plan: number; nombre_plan: string; fecha_inicio: string; fecha_fin: string; observaciones: string | null; comidas: PlannedMeal[] };
export type Consumption = { id_consumo: number; id_alimento: number; alimento: string; fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null };
export type Recipe = { id_receta: number; nombre: string; descripcion: string | null; instrucciones: string; imagen_url: string | null; fecha_creacion?: string };
export type Dashboard = { fecha: string; calorias: number; consumos: number; comidas: number; recetas: number };

export const mealTypes: { value: MealType; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' }, { value: 'almuerzo', label: 'Almuerzo' },
  { value: 'cena', label: 'Cena' }, { value: 'snack', label: 'Snack' },
];
export const foodUnits: { value: FoodUnit; label: string }[] = [
  { value: 'g', label: 'g' }, { value: 'ml', label: 'ml' },
  { value: 'porcion', label: 'porción' }, { value: 'unidad', label: 'unidad' },
];

export const getFoods = (query = '', signal?: AbortSignal) => apiRequest<Food[]>(`/foods?q=${encodeURIComponent(query)}`, { signal });
export const createFood = (data: Omit<Food, 'id_alimento'> & { proteinas?: number | null; carbohidratos?: number | null; grasas?: number | null }) => apiRequest<Food>('/foods', { method: 'POST', body: JSON.stringify(data) });
export const getPlans = (from: string, to: string) => apiRequest<MealPlan[]>(`/plans?from=${from}&to=${to}`);
export const createPlan = (data: Pick<MealPlan, 'nombre_plan' | 'fecha_inicio' | 'fecha_fin' | 'observaciones'>) => apiRequest<MealPlan>('/plans', { method: 'POST', body: JSON.stringify(data) });
export const updatePlan = (id: number, data: Pick<MealPlan, 'nombre_plan' | 'fecha_inicio' | 'fecha_fin' | 'observaciones'>) => apiRequest<MealPlan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlan = (id: number) => apiRequest<void>(`/plans/${id}`, { method: 'DELETE' });
export const createMeal = (planId: number, data: { tipo_comida: MealType; fecha: string; hora: string | null }) => apiRequest<PlannedMeal>(`/plans/${planId}/meals`, { method: 'POST', body: JSON.stringify(data) });
export const updateMeal = (id: number, data: { tipo_comida: MealType; fecha: string; hora: string | null }) => apiRequest<PlannedMeal>(`/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMeal = (id: number) => apiRequest<void>(`/meals/${id}`, { method: 'DELETE' });
export const addMealFood = (id: number, data: { id_alimento: number; cantidad: number; unidad_medida: FoodUnit }) => apiRequest<{ id_detalle: number }>(`/meals/${id}/foods`, { method: 'POST', body: JSON.stringify(data) });
export const deleteMealFood = (id: number) => apiRequest<void>(`/meal-foods/${id}`, { method: 'DELETE' });
export const getConsumptions = (from: string, to: string) => apiRequest<Consumption[]>(`/consumptions?from=${from}&to=${to}`);
export const createConsumption = (data: { id_alimento: number; fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null }) => apiRequest<Consumption>('/consumptions', { method: 'POST', body: JSON.stringify(data) });
export const updateConsumption = (id: number, data: { id_alimento: number; fecha: string; cantidad: number; unidad_medida: FoodUnit; calorias_totales: number | null }) => apiRequest<Consumption>(`/consumptions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteConsumption = (id: number) => apiRequest<void>(`/consumptions/${id}`, { method: 'DELETE' });
export const getRecipes = () => apiRequest<Recipe[]>('/recipes');
export const createRecipe = (data: Omit<Recipe, 'id_receta' | 'fecha_creacion'>) => apiRequest<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(data) });
export const updateRecipe = (id: number, data: Omit<Recipe, 'id_receta' | 'fecha_creacion'>) => apiRequest<Recipe>(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRecipe = (id: number) => apiRequest<void>(`/recipes/${id}`, { method: 'DELETE' });
export const getDashboard = (date: string) => apiRequest<Dashboard>(`/dashboard?fecha=${date}`);

