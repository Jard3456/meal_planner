import { createWorker } from 'tesseract.js';
import { HttpError } from './errors.js';

type NutritionFields = {
  calorias_por_100g: number | null;
  proteinas: number | null;
  carbohidratos: number | null;
  grasas: number | null;
};

let workerPromise: ReturnType<typeof createWorker> | undefined;

function numberFrom(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberAfter(line: string, label: RegExp) {
  const match = line.match(label);
  if (!match || match.index == null) return null;
  const rest = line.slice(match.index + match[0].length);
  const value = rest.match(/\b(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:g|gramos|kcal|cal|kj)?\b/i)?.[1];
  return numberFrom(value);
}

function caloriesFrom(lines: string[]) {
  for (const line of lines) {
    if (!/(calor[ií]as?|calories|energ[ií]a|energy)\b/i.test(line)) continue;
    const kcal = line.match(/(\d{1,5}(?:[.,]\d{1,3})?)\s*kcal\b/i)?.[1];
    if (kcal) return numberFrom(kcal);
    const kj = line.match(/(\d{1,5}(?:[.,]\d{1,3})?)\s*kj\b/i)?.[1];
    if (kj) return Math.round((Number(numberFrom(kj)) / 4.184) * 100) / 100;
    const value = numberAfter(line, /(calor[ií]as?|calories|energ[ií]a|energy)\b/i);
    if (value != null) return value;
  }
  return null;
}

function parseNutrition(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).filter(Boolean);
  const servingLineIndex = lines.findIndex(line => /(tamano.{0,20}porcion|serving size|portion size|^porcion\b|^serving\b|^portion\b)/.test(line));
  const servingContext = servingLineIndex < 0 ? '' : [lines[servingLineIndex], lines[servingLineIndex + 1] ?? ''].join(' ');
  const servingMatch = servingContext.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:g|gr|gramos|grams)\b/i)
    ?? servingContext.match(/(?:g|gr|gramos|grams)\s*[:=-]?\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
  const servingOunces = servingContext.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:oz|ounces?)\b/i)?.[1];
  const servingGrams = numberFrom(servingMatch?.[1]) ?? (numberFrom(servingOunces) == null ? null : Math.round(numberFrom(servingOunces)! * 28.3495 * 100) / 100);
  const per100g = lines.some(line => /(?:por|per|cada)\s*100\s*(?:g|gr|gramos)\b/.test(line));
  const findMacro = (label: RegExp) => {
    for (const line of lines) {
      if (/(saturad|saturated|trans)/.test(line)) continue;
      const result = numberAfter(line, label);
      if (result != null && result <= 1000) return result;
    }
    return null;
  };
  const parsed = {
    calorias_por_100g: caloriesFrom(lines),
    proteinas: findMacro(/(?:proteinas?|protein)\b/),
    carbohidratos: findMacro(/(?:carbohidratos?|carbohydrates?|total carbs?)\b/),
    grasas: findMacro(/(?:grasas?|fat)\b/),
  } satisfies NutritionFields;
  const hasValues = Object.values(parsed).some(value => value != null);
  if (!hasValues) throw new HttpError(422, 'No pude reconocer valores nutricionales. Intenta con una foto más clara y de frente.');

  const baseGrams = per100g ? 100 : servingGrams;
  const conversionApplied = baseGrams != null && baseGrams > 0 && baseGrams !== 100;
  const normalized = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [
    key,
    value == null || (baseGrams == null) ? null : !conversionApplied ? value : Math.round((value / baseGrams * 100) * 100) / 100,
  ])) as NutritionFields;
  const reviewMessage = per100g
    ? 'La etiqueta indica valores por 100 g. Revisa cada campo antes de guardar.'
    : servingGrams
      ? `Valores convertidos desde una porción de ${servingGrams} g a 100 g. Revisa cada campo antes de guardar.`
      : 'No pude leer el peso de la porción, así que no rellené los valores. Toma una foto donde se vea el tamaño o ingrésalos manualmente.';
  return { ...normalized, serving_grams: servingGrams, conversion_applied: conversionApplied, review_message: reviewMessage };
}

export async function readNutritionLabel(image: Buffer) {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    workerPromise ??= createWorker(['spa', 'eng']);
    worker = await workerPromise;
    const { data } = await worker.recognize(image);
    return parseNutrition(data.text);
  } catch (error) {
    if (!worker) workerPromise = undefined;
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'No se pudo leer la foto. Intenta con una imagen nítida y bien iluminada.');
  }
}