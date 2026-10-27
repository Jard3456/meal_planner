import type { UserProfile } from '@/types/meal-planner';

export type CalorieRange = { estimated: number; minimum: number; maximum: number };
export type MacroRange = { minimum: number; maximum: number };
export type MacroTargets = { proteinas: MacroRange; carbohidratos: MacroRange; grasas: MacroRange };

export function estimateDailyCalories(user: UserProfile): CalorieRange | null {
  const { edad, sexo, peso_actual: weight, estatura: height, nivel_actividad: activity, objetivo } = user;
  if (!edad || edad < 19 || !sexo || !weight || !height || !activity || !objetivo) return null;

  const equations = {
    masculino: {
      inactivo: [753.07, -10.83, 6.5, 14.1], bajo: [581.47, -10.83, 8.3, 14.94],
      activo: [1004.82, -10.83, 6.52, 15.91], muy_activo: [-517.88, -10.83, 15.61, 19.11],
    },
    femenino: {
      inactivo: [584.9, -7.01, 5.72, 11.71], bajo: [575.77, -7.01, 6.6, 12.14],
      activo: [710.25, -7.01, 6.54, 12.34], muy_activo: [511.83, -7.01, 9.07, 12.56],
    },
  } as const;
  const [base, ageFactor, heightFactor, weightFactor] = equations[sexo][activity];
  const estimated = Math.round(base + ageFactor * edad + heightFactor * height + weightFactor * weight);
  if (!Number.isFinite(estimated) || estimated <= 0) return null;

  const [low, high] = objetivo === 'bajar_peso' ? [0.85, 0.95]
    : objetivo === 'aumentar_masa_muscular' ? [1.05, 1.15] : [0.95, 1.05];
  return { estimated, minimum: Math.round(estimated * low), maximum: Math.round(estimated * high) };
}

export function estimateMacroTargets(calories: CalorieRange | null): MacroTargets | null {
  if (!calories) return null;
  const grams = (energyLow: number, energyHigh: number, kcalPerGram: number): MacroRange => ({
    minimum: Math.round(calories.minimum * energyLow / kcalPerGram),
    maximum: Math.round(calories.maximum * energyHigh / kcalPerGram),
  });
  return {
    carbohidratos: grams(0.45, 0.65, 4),
    proteinas: grams(0.10, 0.35, 4),
    grasas: grams(0.20, 0.35, 9),
  };
}
