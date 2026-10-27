import { config } from './config.js';
import { HttpError } from './errors.js';

export type ExternalFood = {
  source: 'usda' | 'openfoodfacts';
  source_id: string;
  nombre: string;
  categoria: string | null;
  calorias_por_100g: number | null;
  proteinas: number | null;
  carbohidratos: number | null;
  grasas: number | null;
};

type Nutrient = { name?: string; nutrientName?: string; amount?: number; value?: number; unitName?: string; nutrient?: { name?: string; unitName?: string } };
type FdcFood = { fdcId?: number; description?: string; dataType?: string; foodNutrients?: Nutrient[]; labelNutrients?: Record<string, { value?: number }> };

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null;
}

function nutrient(food: FdcFood, exactName: string): number | null {
  const candidates = food.foodNutrients?.filter(item => (item.nutrient?.name ?? item.name ?? item.nutrientName)?.toLowerCase() === exactName) ?? [];
  const match = exactName === 'energy'
    ? candidates.find(item => (item.nutrient?.unitName ?? item.unitName)?.toLowerCase() === 'kcal')
    : candidates[0];
  return numeric(match?.amount ?? match?.value);
}

function fromUsda(food: FdcFood): ExternalFood | null {
  if (!food.fdcId || !food.description?.trim()) return null;
  return {
    source: 'usda', source_id: String(food.fdcId), nombre: food.description.trim(),
    categoria: food.dataType === 'Branded' ? 'Producto de marca (USDA)' : 'Alimento (USDA)',
    calorias_por_100g: nutrient(food, 'energy'),
    proteinas: nutrient(food, 'protein'),
    carbohidratos: nutrient(food, 'carbohydrate, by difference'),
    grasas: nutrient(food, 'total lipid (fat)'),
  };
}

async function requestJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...init?.headers } });
    if (response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 429) throw new HttpError(503, 'El servicio de consulta alcanzó su límite. Intenta de nuevo más tarde.');
      throw new HttpError(503, 'El servicio de consulta nutricional no está disponible. Intenta de nuevo más tarde.');
    }
    return await response.json() as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'No se pudo conectar con el servicio nutricional. Intenta de nuevo.');
  } finally { clearTimeout(timeout); }
}

export async function searchUsda(query: string): Promise<ExternalFood[]> {
  if (!config.usdaApiKey) throw new HttpError(503, 'La búsqueda USDA no está configurada. Agrega USDA_API_KEY al archivo backend/.env y reinicia el backend.');
  const data = await requestJson(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(config.usdaApiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Branded'] }),
  }) as { foods?: FdcFood[] } | null;
  return (data?.foods ?? []).map(fromUsda).filter((food): food is ExternalFood => food !== null);
}

export async function getOffProduct(barcode: string): Promise<ExternalFood | null> {
  const data = await requestJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,status,product`, {
    headers: { 'User-Agent': 'MealPlanner/1.0 (nutrition lookup)' },
  }) as { status?: number; product?: { code?: string; product_name?: string; product_name_en?: string; brands?: string; categories?: string; nutriments?: Record<string, unknown> } } | null;
  const product = data?.product;
  const name = product?.product_name?.trim() || product?.product_name_en?.trim();
  if (data?.status !== 1 || !product || !name) return null;
  const nutrition = product.nutriments ?? {};
  const brandedName = product.brands?.trim() ? `${name} (${product.brands.trim()})` : name;
  const productCategory = product.categories?.split(',')[0]?.trim();
  return {
    source: 'openfoodfacts', source_id: product.code ?? barcode, nombre: brandedName.slice(0, 150),
    categoria: `Open Food Facts · ${productCategory || 'producto empacado'}`.slice(0, 80),
    calorias_por_100g: numeric(nutrition['energy-kcal_100g']),
    proteinas: numeric(nutrition.proteins_100g),
    carbohidratos: numeric(nutrition.carbohydrates_100g),
    grasas: numeric(nutrition.fat_100g),
  };
}

export async function getUsdaFood(id: string): Promise<ExternalFood | null> {
  if (!config.usdaApiKey) throw new HttpError(503, 'La búsqueda USDA no está configurada. Agrega USDA_API_KEY al archivo backend/.env y reinicia el backend.');
  const data = await requestJson(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(id)}?api_key=${encodeURIComponent(config.usdaApiKey)}`) as FdcFood | null;
  return data ? fromUsda(data) : null;
}
