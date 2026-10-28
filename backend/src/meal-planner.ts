import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';
import { config } from './config.js';
import { requireUser } from './auth.js';
import { HttpError } from './errors.js';
import * as v from './validation.js';
import { getOffProduct, getUsdaFood, type ExternalFood } from './food-sources.js';

type Body = Record<string, unknown>;
type FoodSnapshot = { nombre: string; categoria: string | null; calorias_por_100g: number | null; proteinas: number | null; carbohidratos: number | null; grasas: number | null; source: 'usda' | 'openfoodfacts' | 'recipe'; source_id: string };
const router = Router();
const mealTypes = ['desayuno', 'almuerzo', 'cena', 'snack'] as const;
const units = ['g', 'ml', 'porcion', 'unidad'] as const;
const idParam = (value: string | string[]) => {
  if (Array.isArray(value)) throw new HttpError(400, 'El identificador no es válido.');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'El identificador no es válido.');
  return id;
};
const todayInAppTimeZone = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const dateValue = (value: unknown, label: string) => {
  const date = v.text(value, label, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, `${label}: utiliza una fecha válida.`);
  }
  return date;
};
const timeValue = (value: unknown) => {
  if (value == null || value === '') return null;
  const time = v.text(value, 'Hora', 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, 'Ingresa una hora válida.');
  return `${time}:00`;
};
const mealType = (value: unknown) => {
  if (typeof value !== 'string' || !mealTypes.includes(value as typeof mealTypes[number])) throw new HttpError(400, 'Selecciona un tipo de comida válido.');
  return value;
};
const unitValue = (value: unknown) => {
  if (typeof value !== 'string' || !units.includes(value as typeof units[number])) throw new HttpError(400, 'Selecciona una unidad válida.');
  return value;
};
const positiveId = (value: unknown, label: string) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value)) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw new HttpError(400, `${label}: selecciona una opción válida.`);
  return Number(value);
};
const positiveAmount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 9999999) throw new HttpError(400, 'La cantidad debe ser un número positivo.');
  return Math.round(value * 1000) / 1000;
};
const consumedAmount = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999) throw new HttpError(400, 'La cantidad consumida debe ser cero o un número positivo.');
  return Math.round(value * 1000) / 1000;
};
const referencePortionOptions = {
  proteinas: { alimento: 'pollo cocido', unidad: 'g', macroPorUnidad: 0.31, kcalPorUnidad: 1.65 },
  carbohidratos: { alimento: 'arroz cocido', unidad: 'g', macroPorUnidad: 0.28, kcalPorUnidad: 1.3 },
  grasas: { alimento: 'aceite de oliva', unidad: 'cda', macroPorUnidad: 14, kcalPorUnidad: 119 },
} as const;
type MacroKey = keyof typeof referencePortionOptions;
function completedReferencePortions(value: unknown) {
  if (value == null) return null;
  const body = v.bodyObject(value);
  const result: Partial<Record<MacroKey, { alimento: string; cantidad: number; unidad: string; macro_gramos: number; calorias: number }>> = {};
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(referencePortionOptions, key)) throw new HttpError(400, 'La porción de referencia no es válida.');
    const macro = key as MacroKey;
    const option = referencePortionOptions[macro];
    const item = v.bodyObject(body[macro]);
    const amount = positiveAmount(item.cantidad);
    if (item.unidad !== option.unidad) throw new HttpError(400, 'La unidad de la porción de referencia no es válida.');
    result[macro] = { alimento: option.alimento, cantidad: amount, unidad: option.unidad, macro_gramos: Math.round(amount * option.macroPorUnidad * 100) / 100, calorias: Math.round(amount * option.kcalPorUnidad * 100) / 100 };
  }
  return Object.keys(result).length ? result : null;
}
function parseCompletedReferencePortions(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try { return completedReferencePortions(JSON.parse(value)); }
  catch { return null; }
}
const optionalCalories = (value: unknown) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999) throw new HttpError(400, 'Las calorías deben ser cero o un número positivo.');
  return Math.round(value * 1000) / 1000;
};
const optionalLongText = (value: unknown, label: string, max: number) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new HttpError(400, `${label}: el texto es demasiado largo.`);
  return value.trim();
};
const snapshotFields = (value: unknown): FoodSnapshot => {
  const body = v.bodyObject(value);
  if (body.source !== 'usda' && body.source !== 'openfoodfacts') throw new HttpError(400, 'La fuente del alimento no es válida.');
  const sourceId = v.text(body.source_id, 'Identificador del alimento', 32);
  if (body.source === 'usda' && !/^\d{1,12}$/.test(sourceId)) throw new HttpError(400, 'El identificador USDA no es válido.');
  if (body.source === 'openfoodfacts' && !/^\d{8,14}$/.test(sourceId)) throw new HttpError(400, 'El código de barras no es válido.');
  const nutrition = (item: unknown, label: string, maximum: number) => {
    if (item == null || item === '') return null;
    if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > maximum) throw new HttpError(400, `${label}: ingresa un valor válido.`);
    return Math.round(item * 1000) / 1000;
  };
  return {
    nombre: v.text(body.nombre, 'Nombre del alimento', 150),
    categoria: optionalLongText(body.categoria, 'Categoría', 80),
    calorias_por_100g: nutrition(body.calorias_por_100g, 'Calorías por 100 g', 999999),
    proteinas: nutrition(body.proteinas, 'Proteínas', 100),
    carbohidratos: nutrition(body.carbohidratos, 'Carbohidratos', 100),
    grasas: nutrition(body.grasas, 'Grasas', 100),
    source: body.source,
    source_id: sourceId,
  };
};
const foodReference = (body: Body) => {
  if (body.alimento_snapshot != null) {
    if (body.id_alimento != null) throw new HttpError(400, 'Elige un alimento del catálogo o un alimento externo, no ambos.');
    return { id: null, snapshot: snapshotFields(body.alimento_snapshot) };
  }
  return { id: positiveId(body.id_alimento, 'Alimento'), snapshot: null };
};
const planFields = (body: Body) => {
  const name = v.text(body.nombre_plan, 'Nombre del plan', 150);
  const from = dateValue(body.fecha_inicio, 'Fecha inicial');
  const to = dateValue(body.fecha_fin, 'Fecha final');
  if (to < from) throw new HttpError(400, 'La fecha final debe ser igual o posterior a la fecha inicial.');
  return { name, from, to, notes: optionalLongText(body.observaciones, 'Observaciones', 20000) };
};
const recipeFields = (body: Body) => ({
  name: v.text(body.nombre, 'Nombre de receta', 150),
  description: optionalLongText(body.descripcion, 'Descripción', 20000),
  instructions: v.text(body.instrucciones, 'Instrucciones', 20000),
  imageUrl: optionalLongText(body.imagen_url, 'Imagen', 2048),
});
const ensureOwned = async (table: 'plan_comida' | 'comida' | 'receta', idColumn: string, id: number, userId: number) => {
  const query = table === 'comida'
    ? 'SELECT c.id_comida AS id FROM comida c JOIN plan_comida p ON p.id_plan = c.id_plan WHERE c.id_comida = ? AND p.id_usuario = ?'
    : `SELECT ${idColumn} AS id FROM ${table} WHERE ${idColumn} = ? AND id_usuario = ?`;
  const [rows] = await pool.execute<RowDataPacket[]>(query, [id, userId]);
  if (!rows.length) throw new HttpError(404, 'No encontramos ese registro en tu cuenta.');
};

async function getPlans(userId: number, from: string, to: string) {
  const [plans] = await pool.execute<RowDataPacket[]>(
    `SELECT id_plan, nombre_plan, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
      DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin, observaciones
     FROM plan_comida WHERE id_usuario = ? AND fecha_inicio <= ? AND fecha_fin >= ?
     ORDER BY fecha_inicio, id_plan`, [userId, to, from],
  );
  if (!plans.length) return [];
  const planIds = plans.map(plan => Number(plan.id_plan));
  const marks = planIds.map(() => '?').join(',');
  const [meals] = await pool.execute<RowDataPacket[]>(
    `SELECT id_comida, id_plan, tipo_comida, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
      TIME_FORMAT(hora, '%H:%i') AS hora, referencias_completadas FROM comida WHERE id_plan IN (${marks}) AND fecha BETWEEN ? AND ? ORDER BY fecha, hora, id_comida`, [...planIds, from, to],
  );
  const mealIds = meals.map(meal => Number(meal.id_comida));
  const details = mealIds.length ? (await pool.execute<RowDataPacket[]>(
    `SELECT d.id_detalle, d.id_comida, d.id_alimento, COALESCE(d.nombre_alimento, a.nombre) AS nombre,
      d.cantidad, d.unidad_medida, d.cantidad_consumida, d.unidad_consumida,
      COALESCE(d.calorias_por_100g, a.calorias_por_100g) AS calorias_por_100g,
      COALESCE(d.proteinas, a.proteinas) AS proteinas, COALESCE(d.carbohidratos, a.carbohidratos) AS carbohidratos,
      COALESCE(d.grasas, a.grasas) AS grasas
     FROM detalle_comida d LEFT JOIN alimento a ON a.id_alimento = d.id_alimento
     WHERE d.id_comida IN (${mealIds.map(() => '?').join(',')}) ORDER BY d.id_detalle`, mealIds,
  ))[0] : [];
  const detailByMeal = new Map<number, object[]>();
  for (const row of details) {
    const id = Number(row.id_comida);
    const value = detailByMeal.get(id) ?? [];
    value.push({ id_detalle: Number(row.id_detalle), id_alimento: row.id_alimento == null ? null : Number(row.id_alimento), nombre: String(row.nombre), cantidad: Number(row.cantidad), unidad_medida: String(row.unidad_medida), cantidad_consumida: row.cantidad_consumida == null ? null : Number(row.cantidad_consumida), unidad_consumida: row.unidad_consumida == null ? null : String(row.unidad_consumida), calorias_por_100g: row.calorias_por_100g == null ? null : Number(row.calorias_por_100g), proteinas: row.proteinas == null ? null : Number(row.proteinas), carbohidratos: row.carbohidratos == null ? null : Number(row.carbohidratos), grasas: row.grasas == null ? null : Number(row.grasas) });
    detailByMeal.set(id, value);
  }
  const mealsByPlan = new Map<number, object[]>();
  for (const meal of meals) {
    const planId = Number(meal.id_plan);
    const value = mealsByPlan.get(planId) ?? [];
    value.push({ id_comida: Number(meal.id_comida), tipo_comida: String(meal.tipo_comida), fecha: String(meal.fecha), hora: meal.hora == null ? null : String(meal.hora), referencias_completadas: parseCompletedReferencePortions(meal.referencias_completadas), alimentos: detailByMeal.get(Number(meal.id_comida)) ?? [] });
    mealsByPlan.set(planId, value);
  }
  return plans.map(plan => ({ id_plan: Number(plan.id_plan), nombre_plan: String(plan.nombre_plan), fecha_inicio: String(plan.fecha_inicio), fecha_fin: String(plan.fecha_fin), observaciones: plan.observaciones == null ? null : String(plan.observaciones), comidas: mealsByPlan.get(Number(plan.id_plan)) ?? [] }));
}

router.get('/dashboard', requireUser, async (req, res) => {
  const date = dateValue(req.query.fecha ?? new Date().toISOString().slice(0, 10), 'Fecha');
  const userId = res.locals.userId as number;
  const [[calories]] = await pool.execute<RowDataPacket[]>('SELECT COALESCE(SUM(calorias_totales), 0) AS calorias, COUNT(*) AS consumos FROM consumo_alimento WHERE id_usuario = ? AND fecha = ?', [userId, date]);
  const [[macros]] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN c.fuente_externa = 'recipe' AND c.proteinas IS NOT NULL THEN c.proteinas * c.cantidad WHEN c.unidad_medida = 'g' AND COALESCE(c.proteinas, a.proteinas) IS NOT NULL THEN COALESCE(c.proteinas, a.proteinas) * c.cantidad / 100 ELSE 0 END), 0) AS proteinas,
       COALESCE(SUM(CASE WHEN c.fuente_externa = 'recipe' AND c.carbohidratos IS NOT NULL THEN c.carbohidratos * c.cantidad WHEN c.unidad_medida = 'g' AND COALESCE(c.carbohidratos, a.carbohidratos) IS NOT NULL THEN COALESCE(c.carbohidratos, a.carbohidratos) * c.cantidad / 100 ELSE 0 END), 0) AS carbohidratos,
       COALESCE(SUM(CASE WHEN c.fuente_externa = 'recipe' AND c.grasas IS NOT NULL THEN c.grasas * c.cantidad WHEN c.unidad_medida = 'g' AND COALESCE(c.grasas, a.grasas) IS NOT NULL THEN COALESCE(c.grasas, a.grasas) * c.cantidad / 100 ELSE 0 END), 0) AS grasas,
       COALESCE(SUM(CASE WHEN c.fuente_externa = 'recipe' THEN CASE WHEN c.proteinas IS NULL OR c.carbohidratos IS NULL OR c.grasas IS NULL THEN 1 ELSE 0 END WHEN c.unidad_medida <> 'g' OR COALESCE(c.proteinas, a.proteinas) IS NULL OR COALESCE(c.carbohidratos, a.carbohidratos) IS NULL OR COALESCE(c.grasas, a.grasas) IS NULL THEN 1 ELSE 0 END), 0) AS macros_incompletos
     FROM consumo_alimento c LEFT JOIN alimento a ON a.id_alimento = c.id_alimento
     WHERE c.id_usuario = ? AND c.fecha = ?`, [userId, date],
  );
  const [referenceRows] = await pool.execute<RowDataPacket[]>(
    'SELECT c.referencias_completadas FROM comida c JOIN plan_comida p ON p.id_plan = c.id_plan WHERE p.id_usuario = ? AND c.fecha = ?',
    [userId, date],
  );
  const referenceMacros = { proteinas: 0, carbohidratos: 0, grasas: 0, calorias: 0 };
  for (const row of referenceRows) {
    const portions = parseCompletedReferencePortions(row.referencias_completadas);
    for (const key of ['proteinas', 'carbohidratos', 'grasas'] as const) {
      referenceMacros[key] += portions?.[key]?.macro_gramos ?? 0;
      referenceMacros.calorias += portions?.[key]?.calorias ?? 0;
    }
  }
  const [[meals]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS comidas FROM comida c JOIN plan_comida p ON p.id_plan = c.id_plan WHERE p.id_usuario = ? AND c.fecha = ?`, [userId, date]);
  const [[recipes]] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS recetas FROM receta WHERE id_usuario = ?', [userId]);
  res.json({ fecha: date, calorias: Number(calories.calorias) + referenceMacros.calorias, consumos: Number(calories.consumos), comidas: Number(meals.comidas), recetas: Number(recipes.recetas), proteinas: Number(macros.proteinas) + referenceMacros.proteinas, carbohidratos: Number(macros.carbohidratos) + referenceMacros.carbohidratos, grasas: Number(macros.grasas) + referenceMacros.grasas, macros_incompletos: Number(macros.macros_incompletos) });
});

router.get('/plans', requireUser, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const from = dateValue(req.query.from ?? today, 'Fecha inicial');
  const to = dateValue(req.query.to ?? from, 'Fecha final');
  if (to < from || new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * 86400000) throw new HttpError(400, 'El intervalo debe ser válido y no superar un año.');
  res.json(await getPlans(res.locals.userId, from, to));
});

router.post('/plans', requireUser, async (req, res) => {
  const fields = planFields(v.bodyObject(req.body));
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO plan_comida (id_usuario, nombre_plan, fecha_inicio, fecha_fin, observaciones) VALUES (?, ?, ?, ?, ?)', [res.locals.userId, fields.name, fields.from, fields.to, fields.notes]);
  const [created] = await getPlans(res.locals.userId, fields.from, fields.to);
  const plan = created?.id_plan === result.insertId ? created : { id_plan: result.insertId, nombre_plan: fields.name, fecha_inicio: fields.from, fecha_fin: fields.to, observaciones: fields.notes, comidas: [] };
  res.status(201).json(plan);
});

router.put('/plans/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const fields = planFields(v.bodyObject(req.body));
  await ensureOwned('plan_comida', 'id_plan', id, res.locals.userId);
  await pool.execute('UPDATE plan_comida SET nombre_plan = ?, fecha_inicio = ?, fecha_fin = ?, observaciones = ? WHERE id_plan = ?', [fields.name, fields.from, fields.to, fields.notes, id]);
  const [plan] = await getPlans(res.locals.userId, fields.from, fields.to);
  res.json(plan?.id_plan === id ? plan : { id_plan: id, nombre_plan: fields.name, fecha_inicio: fields.from, fecha_fin: fields.to, observaciones: fields.notes, comidas: [] });
});

router.delete('/plans/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  await ensureOwned('plan_comida', 'id_plan', id, res.locals.userId);
  await pool.execute('DELETE FROM plan_comida WHERE id_plan = ?', [id]);
  res.status(204).end();
});

router.post('/plans/:id/meals', requireUser, async (req, res) => {
  const planId = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const date = dateValue(body.fecha, 'Fecha');
  await ensureOwned('plan_comida', 'id_plan', planId, res.locals.userId);
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO comida (id_plan, tipo_comida, fecha, hora) VALUES (?, ?, ?, ?)', [planId, mealType(body.tipo_comida), date, timeValue(body.hora)]);
  res.status(201).json({ id_comida: result.insertId, id_plan: planId, tipo_comida: body.tipo_comida, fecha: date, hora: timeValue(body.hora), referencias_completadas: null, alimentos: [] });
});

router.post('/plans/:id/generate-meals', requireUser, async (req, res) => {
  const planId = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const from = dateValue(body.fecha_inicio, 'Fecha inicial');
  const to = dateValue(body.fecha_fin, 'Fecha final');
  const span = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
  if (to < from || span > 365) throw new HttpError(400, 'El intervalo debe ser válido y no superar un año.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [plans] = await connection.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin
       FROM plan_comida WHERE id_plan = ? AND id_usuario = ? FOR UPDATE`, [planId, res.locals.userId],
    );
    const plan = plans[0];
    if (!plan) throw new HttpError(404, 'No encontramos ese plan en tu cuenta.');
    if (from < String(plan.fecha_inicio) || to > String(plan.fecha_fin)) throw new HttpError(400, 'El intervalo elegido debe quedar dentro de las fechas del plan.');

    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT DATE_FORMAT(fecha, \'%Y-%m-%d\') AS fecha, tipo_comida FROM comida WHERE id_plan = ? AND fecha BETWEEN ? AND ?',
      [planId, from, to],
    );
    const existingMeals = new Set(existing.map(row => `${String(row.fecha)}:${String(row.tipo_comida)}`));
    const values: string[] = [];
    const params: (number | string)[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const final = new Date(`${to}T00:00:00Z`);
    for (; cursor <= final; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      for (const type of ['desayuno', 'almuerzo', 'cena'] as const) {
        if (existingMeals.has(`${date}:${type}`)) continue;
        values.push('(?, ?, ?, NULL)');
        params.push(planId, type, date);
      }
    }
    if (values.length) await connection.execute(`INSERT INTO comida (id_plan, tipo_comida, fecha, hora) VALUES ${values.join(', ')}`, params);
    await connection.commit();
    res.json({ created_count: values.length });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.put('/meals/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const date = dateValue(body.fecha, 'Fecha');
  const type = mealType(body.tipo_comida);
  const time = timeValue(body.hora);
  await ensureOwned('comida', 'id_comida', id, res.locals.userId);
  await pool.execute('UPDATE comida SET tipo_comida = ?, fecha = ?, hora = ? WHERE id_comida = ?', [type, date, time, id]);
  res.json({ id_comida: id, tipo_comida: type, fecha: date, hora: time });
});

router.put('/meals/:id/reference-portions', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const portions = completedReferencePortions(body.referencias_completadas);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha FROM comida c
     JOIN plan_comida p ON p.id_plan = c.id_plan WHERE c.id_comida = ? AND p.id_usuario = ?`,
    [id, res.locals.userId],
  );
  if (!rows.length) throw new HttpError(404, 'No encontramos esa comida en tu cuenta.');
  if (String(rows[0].fecha) !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes marcar porciones consumidas en comidas de hoy.');
  await pool.execute('UPDATE comida SET referencias_completadas = ? WHERE id_comida = ?', [portions ? JSON.stringify(portions) : null, id]);
  res.json({ id_comida: id, referencias_completadas: portions });
});

router.delete('/meals/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  await ensureOwned('comida', 'id_comida', id, res.locals.userId);
  await pool.execute('DELETE FROM comida WHERE id_comida = ?', [id]);
  res.status(204).end();
});

router.post('/meals/:id/foods', requireUser, async (req, res) => {
  const mealId = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const { id: foodId, snapshot } = foodReference(body);
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  await ensureOwned('comida', 'id_comida', mealId, res.locals.userId);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO detalle_comida (id_comida, id_alimento, nombre_alimento, categoria_alimento, calorias_por_100g, proteinas, carbohidratos, grasas, fuente_externa, id_fuente_externa, cantidad, unidad_medida)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [mealId, foodId, snapshot?.nombre ?? null, snapshot?.categoria ?? null, snapshot?.calorias_por_100g ?? null, snapshot?.proteinas ?? null, snapshot?.carbohidratos ?? null, snapshot?.grasas ?? null, snapshot?.source ?? null, snapshot?.source_id ?? null, amount, unit],
  );
  res.status(201).json({ id_detalle: result.insertId, id_comida: mealId, id_alimento: foodId, cantidad: amount, unidad_medida: unit });
});

router.delete('/meal-foods/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT d.id_detalle FROM detalle_comida d JOIN comida c ON c.id_comida = d.id_comida JOIN plan_comida p ON p.id_plan = c.id_plan WHERE d.id_detalle = ? AND p.id_usuario = ?', [id, res.locals.userId]);
  if (!rows.length) throw new HttpError(404, 'No encontramos ese alimento en tu plan.');
  await pool.execute('DELETE FROM detalle_comida WHERE id_detalle = ?', [id]);
  res.status(204).end();
});

router.put('/meal-foods/:id/consumption', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const amount = consumedAmount(body.cantidad_consumida);
  const unit = unitValue(body.unidad_consumida);
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT d.id_detalle FROM detalle_comida d JOIN comida c ON c.id_comida = d.id_comida JOIN plan_comida p ON p.id_plan = c.id_plan WHERE d.id_detalle = ? AND p.id_usuario = ?',
    [id, res.locals.userId],
  );
  if (!rows.length) throw new HttpError(404, 'No encontramos ese alimento en tu plan.');
  await pool.execute('UPDATE detalle_comida SET cantidad_consumida = ?, unidad_consumida = ? WHERE id_detalle = ?', [amount, unit, id]);
  res.json({ id_detalle: id, cantidad_consumida: amount, unidad_consumida: unit });
});

router.get('/consumptions', requireUser, async (req, res) => {
  const today = todayInAppTimeZone();
  const from = dateValue(req.query.from ?? today, 'Fecha inicial');
  const to = dateValue(req.query.to ?? today, 'Fecha final');
  if (to < from || new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * 86400000) throw new HttpError(400, 'El intervalo debe ser válido y no superar un año.');
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT c.id_consumo, c.id_alimento, COALESCE(c.nombre_alimento, a.nombre) AS alimento, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, c.cantidad, c.unidad_medida, c.calorias_totales, c.categoria_alimento, c.calorias_por_100g, c.proteinas, c.carbohidratos, c.grasas, c.fuente_externa, c.id_fuente_externa FROM consumo_alimento c LEFT JOIN alimento a ON a.id_alimento = c.id_alimento WHERE c.id_usuario = ? AND c.fecha BETWEEN ? AND ? ORDER BY c.fecha DESC, c.id_consumo DESC`, [res.locals.userId, from, to]);
  res.json(rows.map(row => ({ id_consumo: Number(row.id_consumo), id_alimento: row.id_alimento == null ? null : Number(row.id_alimento), alimento: String(row.alimento), fecha: String(row.fecha), cantidad: Number(row.cantidad), unidad_medida: String(row.unidad_medida), calorias_totales: row.calorias_totales == null ? null : Number(row.calorias_totales), food_snapshot: row.fuente_externa == null ? null : { nombre: String(row.alimento), categoria: row.categoria_alimento == null ? null : String(row.categoria_alimento), calorias_por_100g: row.calorias_por_100g == null ? null : Number(row.calorias_por_100g), proteinas: row.proteinas == null ? null : Number(row.proteinas), carbohidratos: row.carbohidratos == null ? null : Number(row.carbohidratos), grasas: row.grasas == null ? null : Number(row.grasas), source: String(row.fuente_externa), source_id: String(row.id_fuente_externa) } })));
});

router.post('/consumptions/recipes', requireUser, async (req, res) => {
  const body = v.bodyObject(req.body);
  const date = dateValue(body.fecha, 'Fecha');
  if (date !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes registrar alimentos para el día actual.');
  const name = v.text(body.nombre, 'Nombre de receta', 150);
  const sourceId = v.text(body.recipe_id, 'Identificador de receta', 32);
  if (!/^[a-z0-9-]+$/.test(sourceId)) throw new HttpError(400, 'El identificador de receta no es válido.');
  const numberField = (value: unknown, label: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999) throw new HttpError(400, `${label}: ingresa un valor válido.`);
    return Math.round(value * 1000) / 1000;
  };
  const calories = numberField(body.calorias, 'Calorías');
  const protein = numberField(body.proteinas, 'Proteínas');
  const carbs = numberField(body.carbohidratos, 'Carbohidratos');
  const fats = numberField(body.grasas, 'Grasas');
  const userId = res.locals.userId as number;
  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id_consumo, COALESCE(nombre_alimento, '') AS alimento, cantidad, unidad_medida, calorias_totales
     FROM consumo_alimento WHERE id_usuario = ? AND fecha = ? AND fuente_externa = 'recipe' AND id_fuente_externa = ? LIMIT 1`,
    [userId, date, sourceId],
  );
  if (existing.length) {
    const row = existing[0];
    return res.json({ id_consumo: Number(row.id_consumo), id_alimento: null, alimento: String(row.alimento), fecha: date, cantidad: Number(row.cantidad), unidad_medida: String(row.unidad_medida), calorias_totales: row.calorias_totales == null ? null : Number(row.calorias_totales), already_consumed: true });
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO consumo_alimento (id_usuario, id_alimento, nombre_alimento, categoria_alimento, calorias_por_100g, proteinas, carbohidratos, grasas, fuente_externa, id_fuente_externa, fecha, cantidad, unidad_medida, calorias_totales)
     VALUES (?, NULL, ?, 'Receta', NULL, ?, ?, ?, 'recipe', ?, ?, 1, 'porcion', ?)`,
    [userId, name, protein, carbs, fats, sourceId, date, calories],
  );
  res.status(201).json({ id_consumo: result.insertId, id_alimento: null, alimento: name, fecha: date, cantidad: 1, unidad_medida: 'porcion', calorias_totales: calories, already_consumed: false });
});

router.post('/consumptions', requireUser, async (req, res) => {
  const body = v.bodyObject(req.body);
  const { id: foodId, snapshot } = foodReference(body);
  const date = dateValue(body.fecha, 'Fecha');
  if (date !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes registrar alimentos para el día actual.');
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  let calories = optionalCalories(body.calorias_totales);
  if (calories == null && unit === 'g') {
    let caloriesPer100g = snapshot?.calorias_por_100g ?? null;
    if (foodId != null) {
      const [foods] = await pool.execute<RowDataPacket[]>('SELECT calorias_por_100g FROM alimento WHERE id_alimento = ?', [foodId]);
      if (!foods.length) throw new HttpError(404, 'No encontramos ese alimento.');
      caloriesPer100g = foods[0].calorias_por_100g == null ? null : Number(foods[0].calorias_por_100g);
    }
    if (caloriesPer100g != null) calories = Math.round(caloriesPer100g * amount) / 100;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO consumo_alimento (id_usuario, id_alimento, nombre_alimento, categoria_alimento, calorias_por_100g, proteinas, carbohidratos, grasas, fuente_externa, id_fuente_externa, fecha, cantidad, unidad_medida, calorias_totales)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [res.locals.userId, foodId, snapshot?.nombre ?? null, snapshot?.categoria ?? null, snapshot?.calorias_por_100g ?? null, snapshot?.proteinas ?? null, snapshot?.carbohidratos ?? null, snapshot?.grasas ?? null, snapshot?.source ?? null, snapshot?.source_id ?? null, date, amount, unit, calories],
  );
  res.status(201).json({ id_consumo: result.insertId, id_alimento: foodId, alimento: snapshot?.nombre, fecha: date, cantidad: amount, unidad_medida: unit, calorias_totales: calories });
});

router.put('/consumptions/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const { id: foodId, snapshot } = foodReference(body);
  const date = dateValue(body.fecha, 'Fecha');
  if (date !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes registrar alimentos para el día actual.');
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  let calories = optionalCalories(body.calorias_totales);
  if (calories == null && unit === 'g') {
    let caloriesPer100g = snapshot?.calorias_por_100g ?? null;
    if (foodId != null) {
      const [foods] = await pool.execute<RowDataPacket[]>('SELECT calorias_por_100g FROM alimento WHERE id_alimento = ?', [foodId]);
      if (!foods.length) throw new HttpError(404, 'No encontramos ese alimento.');
      caloriesPer100g = foods[0].calorias_por_100g == null ? null : Number(foods[0].calorias_por_100g);
    }
    if (caloriesPer100g != null) calories = Math.round(caloriesPer100g * amount) / 100;
  }
  const [existing] = await pool.execute<RowDataPacket[]>('SELECT id_consumo FROM consumo_alimento WHERE id_consumo = ? AND id_usuario = ?', [id, res.locals.userId]);
  if (!existing.length) throw new HttpError(404, 'No encontramos ese consumo en tu cuenta.');
  await pool.execute(
    `UPDATE consumo_alimento SET id_alimento = ?, nombre_alimento = ?, categoria_alimento = ?, calorias_por_100g = ?, proteinas = ?, carbohidratos = ?, grasas = ?, fuente_externa = ?, id_fuente_externa = ?, fecha = ?, cantidad = ?, unidad_medida = ?, calorias_totales = ? WHERE id_consumo = ? AND id_usuario = ?`,
    [foodId, snapshot?.nombre ?? null, snapshot?.categoria ?? null, snapshot?.calorias_por_100g ?? null, snapshot?.proteinas ?? null, snapshot?.carbohidratos ?? null, snapshot?.grasas ?? null, snapshot?.source ?? null, snapshot?.source_id ?? null, date, amount, unit, calories, id, res.locals.userId],
  );
  res.json({ id_consumo: id, id_alimento: foodId, alimento: snapshot?.nombre, fecha: date, cantidad: amount, unidad_medida: unit, calorias_totales: calories });
});

router.delete('/consumptions/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const [result] = await pool.execute<ResultSetHeader>('DELETE FROM consumo_alimento WHERE id_consumo = ? AND id_usuario = ?', [id, res.locals.userId]);
  if (!result.affectedRows) throw new HttpError(404, 'No encontramos ese consumo en tu cuenta.');
  res.status(204).end();
});

router.get('/recipes', requireUser, async (_req, res) => {
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT id_receta, nombre, descripcion, instrucciones, imagen_url, DATE_FORMAT(fecha_creacion, '%Y-%m-%d %H:%i:%s') AS fecha_creacion FROM receta WHERE id_usuario = ? ORDER BY fecha_creacion DESC, id_receta DESC`, [res.locals.userId]);
  res.json(rows.map(row => ({ id_receta: Number(row.id_receta), nombre: String(row.nombre), descripcion: row.descripcion == null ? null : String(row.descripcion), instrucciones: String(row.instrucciones), imagen_url: row.imagen_url == null ? null : String(row.imagen_url), fecha_creacion: String(row.fecha_creacion) })));
});

router.post('/recipes', requireUser, async (req, res) => {
  const fields = recipeFields(v.bodyObject(req.body));
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO receta (id_usuario, nombre, descripcion, instrucciones, imagen_url) VALUES (?, ?, ?, ?, ?)', [res.locals.userId, fields.name, fields.description, fields.instructions, fields.imageUrl]);
  res.status(201).json({ id_receta: result.insertId, nombre: fields.name, descripcion: fields.description, instrucciones: fields.instructions, imagen_url: fields.imageUrl });
});

router.put('/recipes/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const fields = recipeFields(v.bodyObject(req.body));
  await ensureOwned('receta', 'id_receta', id, res.locals.userId);
  await pool.execute('UPDATE receta SET nombre = ?, descripcion = ?, instrucciones = ?, imagen_url = ? WHERE id_receta = ?', [fields.name, fields.description, fields.instructions, fields.imageUrl, id]);
  res.json({ id_receta: id, nombre: fields.name, descripcion: fields.description, instrucciones: fields.instructions, imagen_url: fields.imageUrl });
});

router.delete('/recipes/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  await ensureOwned('receta', 'id_receta', id, res.locals.userId);
  await pool.execute('DELETE FROM receta WHERE id_receta = ?', [id]);
  res.status(204).end();
});

router.post('/foods', requireUser, async (req, res) => {
  const body = v.bodyObject(req.body);
  const name = v.text(body.nombre, 'Nombre', 150);
  const category = optionalLongText(body.categoria, 'Categoría', 80);
  const nutrition = (value: unknown, label: string, maximum: number) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) throw new HttpError(400, `${label}: ingresa un valor válido.`);
    return Math.round(value * 1000) / 1000;
  };
  const calories = nutrition(body.calorias_por_100g, 'Calorías por 100 g', 999999);
  const protein = nutrition(body.proteinas, 'Proteínas', 100);
  const carbs = nutrition(body.carbohidratos, 'Carbohidratos', 100);
  const fats = nutrition(body.grasas, 'Grasas', 100);
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO alimento (nombre, categoria, calorias_por_100g, proteinas, carbohidratos, grasas) VALUES (?, ?, ?, ?, ?, ?)', [name, category, calories, protein, carbs, fats]);
  res.status(201).json({ id_alimento: result.insertId, nombre: name, categoria: category, calorias_por_100g: calories, proteinas: protein, carbohidratos: carbs, grasas: fats });
});

router.get('/foods/search/openfoodfacts', requireUser, async (req, res) => {
  if (typeof req.query.barcode !== 'string' || !/^\d{8,14}$/.test(req.query.barcode)) throw new HttpError(400, 'Ingresa un código de barras válido de 8 a 14 dígitos.');
  const product = await getOffProduct(req.query.barcode);
  if (!product) throw new HttpError(404, 'No se encontró el producto. Ingresa sus datos manualmente.');
  res.json(product);
});

router.post('/foods/resolve', requireUser, async (req, res) => {
  const body = v.bodyObject(req.body);
  if (body.source !== 'usda' && body.source !== 'openfoodfacts') throw new HttpError(400, 'Selecciona una fuente nutricional válida.');
  const sourceId = v.text(body.source_id, 'Identificador', 32);
  let food: ExternalFood | null;
  if (body.source === 'usda') {
    if (!/^\d{1,12}$/.test(sourceId)) throw new HttpError(400, 'El identificador USDA no es válido.');
    food = await getUsdaFood(sourceId);
  } else {
    if (!/^\d{8,14}$/.test(sourceId)) throw new HttpError(400, 'El código de barras no es válido.');
    food = await getOffProduct(sourceId);
  }
  if (!food) throw new HttpError(404, 'El alimento ya no está disponible en la fuente externa.');

  const toStoredFood = (id: number) => ({ ...food, id_alimento: id });
  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id_alimento FROM alimento WHERE fuente_externa = ? AND id_fuente_externa = ? LIMIT 1`,
    [body.source, sourceId],
  );
  if (existing[0]) { res.json(toStoredFood(Number(existing[0].id_alimento))); return; }

  const [legacy] = await pool.execute<RowDataPacket[]>(
    `SELECT id_alimento FROM alimento WHERE fuente_externa = ? AND id_fuente_externa IS NULL AND nombre = ? AND categoria <=> ? AND calorias_por_100g <=> ? AND proteinas <=> ? AND carbohidratos <=> ? AND grasas <=> ? LIMIT 1`,
    [body.source, food.nombre, food.categoria, food.calorias_por_100g, food.proteinas, food.carbohidratos, food.grasas],
  );
  if (legacy[0]) {
    const id = Number(legacy[0].id_alimento);
    await pool.execute('UPDATE alimento SET id_fuente_externa = ? WHERE id_alimento = ?', [sourceId, id]);
    res.json(toStoredFood(id));
    return;
  }

  const [created] = await pool.execute<ResultSetHeader>(
    `INSERT INTO alimento (nombre, categoria, calorias_por_100g, proteinas, carbohidratos, grasas, fuente_externa, id_fuente_externa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [food.nombre, food.categoria, food.calorias_por_100g, food.proteinas, food.carbohidratos, food.grasas, body.source, sourceId],
  );
  res.status(201).json(toStoredFood(created.insertId));
});

export default router;
