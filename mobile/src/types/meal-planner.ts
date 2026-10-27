// Valores alineados con database/meal_planner_mysql.sql.
export type FoodGoal = 'bajar_peso' | 'aumentar_masa_muscular' | 'mantener_peso';
export type MealType = 'desayuno' | 'almuerzo' | 'cena' | 'snack';
export type FoodUnit = 'g' | 'ml' | 'porcion' | 'unidad';
export type BiologicalSex = 'femenino' | 'masculino';
export type ActivityLevel = 'inactivo' | 'bajo' | 'activo' | 'muy_activo';

// El DTO publico nunca incluye password_hash.
export interface UserProfile {
  id_usuario: number;
  nombre: string;
  apellido: string | null;
  correo: string;
  objetivo: FoodGoal | null;
  peso_actual: number | null;
  estatura: number | null;
  edad: number | null;
  sexo: BiologicalSex | null;
  nivel_actividad: ActivityLevel | null;
}
