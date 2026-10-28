import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,
  connectTimeout: 5000,
  enableKeepAlive: true,
  decimalNumbers: true,
  dateStrings: true,
  timezone: 'Z',
  charset: 'utf8mb4',
});

async function ensureExternalFoodSnapshots() {
  const [profileRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario'`,
    [config.db.database],
  );
  const profileColumns = new Set(profileRows.map(row => String(row.nombre)));
  if (!profileColumns.has('edad')) await pool.query('ALTER TABLE usuario ADD COLUMN edad TINYINT UNSIGNED NULL');
  if (!profileColumns.has('sexo')) await pool.query("ALTER TABLE usuario ADD COLUMN sexo VARCHAR(12) NULL");
  if (!profileColumns.has('nivel_actividad')) await pool.query("ALTER TABLE usuario ADD COLUMN nivel_actividad VARCHAR(16) NULL");
  const [foodRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'alimento'`,
    [config.db.database],
  );
  const foodColumns = new Set(foodRows.map(row => String(row.nombre)));
  if (!foodColumns.has('fuente_externa')) await pool.query('ALTER TABLE alimento ADD COLUMN fuente_externa VARCHAR(20) NULL');
  if (!foodColumns.has('id_fuente_externa')) await pool.query('ALTER TABLE alimento ADD COLUMN id_fuente_externa VARCHAR(32) NULL');
  const [sourceIndex] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'alimento' AND INDEX_NAME = 'uq_alimento_fuente'`,
    [config.db.database],
  );
  if (!sourceIndex.length) await pool.query('ALTER TABLE alimento ADD UNIQUE KEY uq_alimento_fuente (fuente_externa, id_fuente_externa)');
  await pool.query(`UPDATE alimento SET fuente_externa = 'usda' WHERE fuente_externa IS NULL AND categoria LIKE '%(USDA)%'`);
  await pool.query(`UPDATE alimento SET fuente_externa = 'openfoodfacts' WHERE fuente_externa IS NULL AND categoria LIKE 'Open Food Facts%'`);

  const columns = [
    ['nombre_alimento', 'VARCHAR(150) NULL'],
    ['categoria_alimento', 'VARCHAR(80) NULL'],
    ['calorias_por_100g', 'DECIMAL(9,3) NULL'],
    ['proteinas', 'DECIMAL(7,3) NULL'],
    ['carbohidratos', 'DECIMAL(7,3) NULL'],
    ['grasas', 'DECIMAL(7,3) NULL'],
    ['fuente_externa', 'VARCHAR(20) NULL'],
    ['id_fuente_externa', 'VARCHAR(32) NULL'],
  ] as const;
  for (const table of ['detalle_comida', 'consumo_alimento'] as const) {
    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME AS nombre, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [config.db.database, table],
    );
    const existing = new Map(rows.map(row => [String(row.nombre), String(row.nullable)]));
    for (const [name, definition] of columns) {
      if (!existing.has(name)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
    if (existing.get('id_alimento') === 'NO') await pool.query(`ALTER TABLE ${table} MODIFY COLUMN id_alimento INT UNSIGNED NULL`);
  }
  const [mealDetailRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'detalle_comida'`,
    [config.db.database],
  );
  const mealDetailColumns = new Set(mealDetailRows.map(row => String(row.nombre)));
  if (!mealDetailColumns.has('cantidad_consumida')) await pool.query('ALTER TABLE detalle_comida ADD COLUMN cantidad_consumida DECIMAL(10,2) NULL');
  if (!mealDetailColumns.has('unidad_consumida')) await pool.query('ALTER TABLE detalle_comida ADD COLUMN unidad_consumida VARCHAR(12) NULL');
  const [mealColumns] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'comida'`,
    [config.db.database],
  );
  if (!mealColumns.some(row => String(row.nombre) === 'referencias_completadas')) await pool.query('ALTER TABLE comida ADD COLUMN referencias_completadas TEXT NULL');
}

export async function checkDatabase() {
  await pool.query('SELECT 1');
  const expected = ['usuario', 'alimento', 'plan_comida', 'comida', 'detalle_comida', 'consumo_alimento', 'receta'];
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.db.database],
  );
  const names = new Set(rows.map(row => row.nombre));
  const missing = expected.filter(name => !names.has(name));
  if (missing.length) throw new Error(`Faltan tablas: ${missing.join(', ')}. Ejecuta npm run db:init.`);
  await ensureExternalFoodSnapshots();
}
