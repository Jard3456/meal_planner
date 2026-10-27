import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';
import { config } from './config.js';
import { requireUser } from './auth.js';
import { HttpError } from './errors.js';
import * as v from './validation.js';
import { getOffProduct, getUsdaFood, type ExternalFood } from './food-sources.js';

type Body = Record<string, unknown>;
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
      TIME_FORMAT(hora, '%H:%i') AS hora FROM comida WHERE id_plan IN (${marks}) AND fecha BETWEEN ? AND ? ORDER BY fecha, hora, id_comida`, [...planIds, from, to],
  );
  const mealIds = meals.map(meal => Number(meal.id_comida));
  const details = mealIds.length ? (await pool.execute<RowDataPacket[]>(
    `SELECT d.id_detalle, d.id_comida, d.id_alimento, a.nombre, d.cantidad, d.unidad_medida,
      a.calorias_por_100g FROM detalle_comida d JOIN alimento a ON a.id_alimento = d.id_alimento
     WHERE d.id_comida IN (${mealIds.map(() => '?').join(',')}) ORDER BY d.id_detalle`, mealIds,
  ))[0] : [];
  const detailByMeal = new Map<number, object[]>();
  for (const row of details) {
    const id = Number(row.id_comida);
    const value = detailByMeal.get(id) ?? [];
    value.push({ id_detalle: Number(row.id_detalle), id_alimento: Number(row.id_alimento), nombre: String(row.nombre), cantidad: Number(row.cantidad), unidad_medida: String(row.unidad_medida), calorias_por_100g: row.calorias_por_100g == null ? null : Number(row.calorias_por_100g) });
    detailByMeal.set(id, value);
  }
  const mealsByPlan = new Map<number, object[]>();
  for (const meal of meals) {
    const planId = Number(meal.id_plan);
    const value = mealsByPlan.get(planId) ?? [];
    value.push({ id_comida: Number(meal.id_comida), tipo_comida: String(meal.tipo_comida), fecha: String(meal.fecha), hora: meal.hora == null ? null : String(meal.hora), alimentos: detailByMeal.get(Number(meal.id_comida)) ?? [] });
    mealsByPlan.set(planId, value);
  }
  return plans.map(plan => ({ id_plan: Number(plan.id_plan), nombre_plan: String(plan.nombre_plan), fecha_inicio: String(plan.fecha_inicio), fecha_fin: String(plan.fecha_fin), observaciones: plan.observaciones == null ? null : String(plan.observaciones), comidas: mealsByPlan.get(Number(plan.id_plan)) ?? [] }));
}

router.get('/dashboard', requireUser, async (req, res) => {
  const date = dateValue(req.query.fecha ?? new Date().toISOString().slice(0, 10), 'Fecha');
  const userId = res.locals.userId as number;
  const [[calories]] = await pool.execute<RowDataPacket[]>('SELECT COALESCE(SUM(calorias_totales), 0) AS calorias, COUNT(*) AS consumos FROM consumo_alimento WHERE id_usuario = ? AND fecha = ?', [userId, date]);
  const [[meals]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS comidas FROM comida c JOIN plan_comida p ON p.id_plan = c.id_plan WHERE p.id_usuario = ? AND c.fecha = ?`, [userId, date]);
  const [[recipes]] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS recetas FROM receta WHERE id_usuario = ?', [userId]);
  res.json({ fecha: date, calorias: Number(calories.calorias), consumos: Number(calories.consumos), comidas: Number(meals.comidas), recetas: Number(recipes.recetas) });
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
  res.status(201).json({ id_comida: result.insertId, id_plan: planId, tipo_comida: body.tipo_comida, fecha: date, hora: timeValue(body.hora), alimentos: [] });
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

router.delete('/meals/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  await ensureOwned('comida', 'id_comida', id, res.locals.userId);
  await pool.execute('DELETE FROM comida WHERE id_comida = ?', [id]);
  res.status(204).end();
});

router.post('/meals/:id/foods', requireUser, async (req, res) => {
  const mealId = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const foodId = positiveId(body.id_alimento, 'Alimento');
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  await ensureOwned('comida', 'id_comida', mealId, res.locals.userId);
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO detalle_comida (id_comida, id_alimento, cantidad, unidad_medida) VALUES (?, ?, ?, ?)', [mealId, foodId, amount, unit]);
  res.status(201).json({ id_detalle: result.insertId, id_comida: mealId, id_alimento: foodId, cantidad: amount, unidad_medida: unit });
});

router.delete('/meal-foods/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT d.id_detalle FROM detalle_comida d JOIN comida c ON c.id_comida = d.id_comida JOIN plan_comida p ON p.id_plan = c.id_plan WHERE d.id_detalle = ? AND p.id_usuario = ?', [id, res.locals.userId]);
  if (!rows.length) throw new HttpError(404, 'No encontramos ese alimento en tu plan.');
  await pool.execute('DELETE FROM detalle_comida WHERE id_detalle = ?', [id]);
  res.status(204).end();
});

router.get('/consumptions', requireUser, async (req, res) => {
  const today = todayInAppTimeZone();
  const from = dateValue(req.query.from ?? today, 'Fecha inicial');
  const to = dateValue(req.query.to ?? today, 'Fecha final');
  if (to < from || new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * 86400000) throw new HttpError(400, 'El intervalo debe ser válido y no superar un año.');
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT c.id_consumo, c.id_alimento, a.nombre AS alimento, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, c.cantidad, c.unidad_medida, c.calorias_totales FROM consumo_alimento c JOIN alimento a ON a.id_alimento = c.id_alimento WHERE c.id_usuario = ? AND c.fecha BETWEEN ? AND ? ORDER BY c.fecha DESC, c.id_consumo DESC`, [res.locals.userId, from, to]);
  res.json(rows.map(row => ({ id_consumo: Number(row.id_consumo), id_alimento: Number(row.id_alimento), alimento: String(row.alimento), fecha: String(row.fecha), cantidad: Number(row.cantidad), unidad_medida: String(row.unidad_medida), calorias_totales: row.calorias_totales == null ? null : Number(row.calorias_totales) })));
});

router.post('/consumptions', requireUser, async (req, res) => {
  const body = v.bodyObject(req.body);
  const foodId = positiveId(body.id_alimento, 'Alimento');
  const date = dateValue(body.fecha, 'Fecha');
  if (date !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes registrar alimentos para el día actual.');
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  let calories = optionalCalories(body.calorias_totales);
  if (calories == null && unit === 'g') {
    const [foods] = await pool.execute<RowDataPacket[]>('SELECT calorias_por_100g FROM alimento WHERE id_alimento = ?', [foodId]);
    if (!foods.length) throw new HttpError(404, 'No encontramos ese alimento.');
    if (foods[0].calorias_por_100g != null) calories = Math.round(Number(foods[0].calorias_por_100g) * amount) / 100;
  }
  const [result] = await pool.execute<ResultSetHeader>('INSERT INTO consumo_alimento (id_usuario, id_alimento, fecha, cantidad, unidad_medida, calorias_totales) VALUES (?, ?, ?, ?, ?, ?)', [res.locals.userId, foodId, date, amount, unit, calories]);
  res.status(201).json({ id_consumo: result.insertId, id_alimento: foodId, fecha: date, cantidad: amount, unidad_medida: unit, calorias_totales: calories });
});

router.put('/consumptions/:id', requireUser, async (req, res) => {
  const id = idParam(req.params.id);
  const body = v.bodyObject(req.body);
  const foodId = positiveId(body.id_alimento, 'Alimento');
  const date = dateValue(body.fecha, 'Fecha');
  if (date !== todayInAppTimeZone()) throw new HttpError(400, 'Solo puedes registrar alimentos para el día actual.');
  const amount = positiveAmount(body.cantidad);
  const unit = unitValue(body.unidad_medida);
  let calories = optionalCalories(body.calorias_totales);
  if (calories == null && unit === 'g') {
    const [foods] = await pool.execute<RowDataPacket[]>('SELECT calorias_por_100g FROM alimento WHERE id_alimento = ?', [foodId]);
    if (!foods.length) throw new HttpError(404, 'No encontramos ese alimento.');
    if (foods[0].calorias_por_100g != null) calories = Math.round(Number(foods[0].calorias_por_100g) * amount) / 100;
  }
  const [existing] = await pool.execute<RowDataPacket[]>('SELECT id_consumo FROM consumo_alimento WHERE id_consumo = ? AND id_usuario = ?', [id, res.locals.userId]);
  if (!existing.length) throw new HttpError(404, 'No encontramos ese consumo en tu cuenta.');
  await pool.execute('UPDATE consumo_alimento SET id_alimento = ?, fecha = ?, cantidad = ?, unidad_medida = ?, calorias_totales = ? WHERE id_consumo = ? AND id_usuario = ?', [foodId, date, amount, unit, calories, id, res.locals.userId]);
  res.json({ id_consumo: id, id_alimento: foodId, fecha: date, cantidad: amount, unidad_medida: unit, calorias_totales: calories });
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
  if (!product) throw new HttpError(404, 'No encontramos ese producto en Open Food Facts. Puedes completar sus datos manualmente.');
  res.json(product);
});

router.post('/foods/import', requireUser, async (req, res) => {
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

  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id_alimento, nombre, categoria, calorias_por_100g, proteinas, carbohidratos, grasas
     FROM alimento WHERE nombre = ? AND categoria <=> ? AND calorias_por_100g <=> ? AND proteinas <=> ? AND carbohidratos <=> ? AND grasas <=> ? LIMIT 1`,
    [food.nombre, food.categoria, food.calorias_por_100g, food.proteinas, food.carbohidratos, food.grasas],
  );
  if (existing[0]) {
    const row = existing[0];
    res.json({ id_alimento: Number(row.id_alimento), nombre: String(row.nombre), categoria: row.categoria == null ? null : String(row.categoria), calorias_por_100g: row.calorias_por_100g == null ? null : Number(row.calorias_por_100g), proteinas: row.proteinas == null ? null : Number(row.proteinas), carbohidratos: row.carbohidratos == null ? null : Number(row.carbohidratos), grasas: row.grasas == null ? null : Number(row.grasas) });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO alimento (nombre, categoria, calorias_por_100g, proteinas, carbohidratos, grasas) VALUES (?, ?, ?, ?, ?, ?)',
    [food.nombre, food.categoria, food.calorias_por_100g, food.proteinas, food.carbohidratos, food.grasas],
  );
  res.status(201).json({ id_alimento: result.insertId, nombre: food.nombre, categoria: food.categoria, calorias_por_100g: food.calorias_por_100g, proteinas: food.proteinas, carbohidratos: food.carbohidratos, grasas: food.grasas });
});

export default router;
