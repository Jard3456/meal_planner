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

export async function checkDatabase() {
  await pool.query('SELECT 1');
  const expected = ['usuario', 'alimento', 'plan_comida', 'comida', 'detalle_comida', 'consumo_alimento', 'receta'];
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.db.database],
  );
  const names = new Set(rows.map(row => row.nombre));
  const missing = expected.filter(name => !names.has(name));
  if (missing.length) throw new Error(`Faltan tablas: ${missing.join(', ')}. Ejecuta npm run db:init.`);
}
