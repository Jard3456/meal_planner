import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

if (config.db.database !== 'meal_planner') throw new Error('El script SQL crea meal_planner. Para otra base adapta primero el script SQL.');
const windowsClient = 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe';
const binary = process.env.MYSQL_BIN || (existsSync(windowsClient) ? windowsClient : 'mysql');
const sql = readFileSync(fileURLToPath(new URL('../../../database/meal_planner_mysql.sql', import.meta.url)), 'utf8');
const child = spawn(binary, [
  '--no-defaults', `--host=${config.db.host}`, `--port=${config.db.port}`, `--user=${config.db.user}`,
  '--connect-timeout=5', '--default-character-set=utf8mb4',
], { env: { ...process.env, MYSQL_PWD: config.db.password }, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
child.stdin?.on('error', () => {});
child.once('error', () => { console.error('No se pudo abrir el cliente MySQL. Configura MYSQL_BIN.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
child.stdin?.end(sql);
