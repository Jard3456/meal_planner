import { createApp } from './app.js';
import { config } from './config.js';
import { checkDatabase, pool } from './db.js';

try {
  await checkDatabase();
  const server = createApp().listen(config.port, config.host, () => {
    console.log(`Meal Planner API escuchando en el puerto ${config.port}. MySQL conectado.`);
  });
  server.on('error', error => { console.error('No se pudo iniciar la API:', error.message); void pool.end().finally(() => process.exit(1)); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { server.close(() => { void pool.end().finally(() => process.exit(0)); }); });
  }
} catch (error) {
  const code = (error as { code?: string }).code;
  console.error('No se pudo conectar MySQL:', code ?? (error as Error).message);
  console.error('Revisa backend/.env y ejecuta npm run db:check o npm run db:init.');
  await pool.end();
  process.exitCode = 1;
}
