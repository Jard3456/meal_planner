import { checkDatabase, pool } from '../db.js';

try {
  await checkDatabase();
  console.log('MySQL conectado; las siete tablas de Meal Planner estan disponibles.');
} catch (error) {
  console.error('Conexion no disponible:', (error as { code?: string }).code ?? (error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
