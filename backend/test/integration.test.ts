import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { RowDataPacket } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { pool, checkDatabase } from '../src/db.js';

const enabled = process.env.MP_TEST_DB === '1' && process.env.DB_NAME?.startsWith('meal_planner_qa_');
after(async () => { await pool.end(); });

test('API y MySQL: registro, autenticacion, perfil y catalogo', { skip: !enabled }, async context => {
  await checkDatabase();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const suffix = `${Date.now()}`;
  const correo = `qa-${suffix}@example.test`;
  let token = '';
  let userId = 0;
  const createdUsers: number[] = [];
  const createdFoods: number[] = [];
  async function request(path: string, method = 'GET', data?: unknown, credential?: string) {
    const res = await fetch(base+path, {
      method, headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: res.status, body: await res.json() };
  }
  try {
    await context.test('Health consulta MySQL y perfil exige sesion', async () => {
      assert.equal((await request('/health')).body.database, 'connected');
      assert.equal((await request('/me')).status, 401);
    });
    await context.test('Registro persiste cuenta sin exponer el hash', async () => {
      const response = await request('/auth/register', 'POST', { nombre: 'Prueba', apellido: 'API', correo: `  ${correo.toUpperCase()} `, password: 'Una-clave-qa-123' });
      assert.equal(response.status, 201);
      token = response.body.token; userId = response.body.user.id_usuario; createdUsers.push(userId);
      assert.equal(response.body.user.correo, correo);
      assert.equal('password_hash' in response.body.user, false);
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT password_hash FROM usuario WHERE id_usuario = ?', [userId]);
      assert.notEqual(rows[0].password_hash, 'Una-clave-qa-123');
      assert.match(rows[0].password_hash, /^\$2[aby]\$/);
    });
    await context.test('Duplicados y credenciales incorrectas se rechazan', async () => {
      assert.equal((await request('/auth/register', 'POST', { nombre: 'Duplicado', correo, password: 'Una-clave-qa-123' })).status, 409);
      assert.equal((await request('/auth/login', 'POST', { correo, password: 'Clave-incorrecta' })).status, 401);
      const login = await request('/auth/login', 'POST', { correo, password: 'Una-clave-qa-123' });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.id_usuario, userId);
      token = login.body.token;
    });
    await context.test('Perfil se guarda y decimales vuelven como numeros', async () => {
      const changed = await request('/me', 'PATCH', { nombre: 'Actualizado', apellido: null, objetivo: 'mantener_peso', peso_actual: 70.25, estatura: 175.5 }, token);
      assert.equal(changed.status, 200);
      assert.equal(changed.body.peso_actual, 70.25);
      const saved = await request('/me', 'GET', undefined, token);
      assert.equal(saved.body.nombre, 'Actualizado');
      assert.equal(saved.body.estatura, 175.5);
      assert.equal(saved.body.objetivo, 'mantener_peso');
      assert.equal('password_hash' in saved.body, false);
    });
    await context.test('Cada cuenta accede a su propio perfil y no elige un id ajeno', async () => {
      const second = await request('/auth/register', 'POST', { nombre: 'Segunda', correo: `qa-second-${suffix}@example.test`, password: 'Otra-clave-qa-123' });
      assert.equal(second.status, 201); createdUsers.push(second.body.user.id_usuario);
      const otherToken = second.body.token;
      assert.equal((await request('/me', 'PATCH', { id_usuario: userId, nombre: 'Ajeno' }, otherToken)).status, 400);
      assert.equal((await request('/me', 'GET', undefined, token)).body.nombre, 'Actualizado');
      assert.equal((await request('/me', 'GET', undefined, otherToken)).body.nombre, 'Segunda');
      assert.equal((await request('/me', 'GET', undefined, `${token}alterado`)).status, 401);
    });
    await context.test('Datos invalidos y campos desconocidos no se guardan', async () => {
      assert.equal((await request('/me', 'PATCH', { peso_actual: -10 }, token)).status, 400);
      assert.equal((await request('/me', 'PATCH', { objetivo: 'invalido' }, token)).status, 400);
      assert.equal((await request('/me', 'PATCH', { correo: 'otro@example.test' }, token)).status, 400);
      assert.equal((await request('/auth/register', 'POST', { nombre: 'X', correo: 'sin-correo', password: '12345678' })).status, 400);
    });
    await context.test('Catalogo lee MySQL y trata comodines como texto', async () => {
      const [one] = await pool.execute<import('mysql2/promise').ResultSetHeader>('INSERT INTO alimento (nombre, calorias_por_100g) VALUES (?, ?)', [`Prueba%${suffix}`, 123.5]);
      createdFoods.push(one.insertId);
      const foods = await request(`/foods?q=${encodeURIComponent(`Prueba%${suffix}`)}`);
      assert.equal(foods.status, 200);
      assert.equal(foods.body.length, 1);
      assert.equal(foods.body[0].calorias_por_100g, 123.5);
      assert.deepEqual((await request(`/foods?q=${encodeURIComponent("%' OR 1=1 --")}`)).body, []);
    });
  } finally {
    for (const id of createdUsers) await pool.execute('DELETE FROM usuario WHERE id_usuario = ?', [id]);
    for (const id of createdFoods) await pool.execute('DELETE FROM alimento WHERE id_alimento = ?', [id]);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
