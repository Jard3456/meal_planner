import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import multer from 'multer';
import { readNutritionLabel } from './nutrition-label.js';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { config } from './config.js';
import { pool } from './db.js';
import { createToken, requireUser } from './auth.js';
import { getProfile } from './users.js';
import { HttpError } from './errors.js';
import * as v from './validation.js';
import { searchUsda } from './food-sources.js';
import mealPlannerRouter from './meal-planner.js';

export function createApp() {
  if (Buffer.byteLength(config.jwtSecret, 'utf8') < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres privados.');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new HttpError(403, 'Origen no permitido.'));
    },
  }));
  app.use(express.json({ limit: '16kb' }));

  const nutritionUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        callback(new HttpError(400, 'Usa una foto JPG, PNG o WebP.'));
        return;
      }
      callback(null, true);
    },
  });
  const uploadNutritionImage: RequestHandler = (req, res, next) => {
    nutritionUpload.single('image')(req, res, error => {
      if (error instanceof multer.MulterError) {
        next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar 5 MB.' : 'No se pudo recibir la foto.'));
        return;
      }
      next(error);
    });
  };

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const body = v.bodyObject(req.body);
    const nombre = v.text(body.nombre, 'Nombre', 100);
    const apellido = v.optionalText(body.apellido, 'Apellido', 100);
    const correo = v.email(body.correo);
    const password = v.password(body.password);
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO usuario (nombre, apellido, correo, password_hash) VALUES (?, ?, ?, ?)',
      [nombre, apellido, correo, hash],
    );
    const user = await getProfile(result.insertId);
    res.status(201).json({ token: await createToken(result.insertId), user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const body = v.bodyObject(req.body);
    const correo = v.email(body.correo);
    const password = v.password(body.password);
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id_usuario, password_hash FROM usuario WHERE correo = ?', [correo],
    );
    const user = rows[0];
    if (!user || !await bcrypt.compare(password, String(user.password_hash))) throw new HttpError(401, 'Correo o contraseña incorrectos.');
    res.json({ token: await createToken(Number(user.id_usuario)), user: await getProfile(Number(user.id_usuario)) });
  });

  app.get('/api/me', requireUser, async (_req, res) => {
    const user = await getProfile(res.locals.userId);
    if (!user) throw new HttpError(401, 'La cuenta ya no está disponible. Inicia sesión de nuevo.');
    res.json(user);
  });

  app.patch('/api/me', requireUser, async (req, res) => {
    const previous = await getProfile(res.locals.userId);
    if (!previous) throw new HttpError(401, 'La cuenta ya no está disponible.');
    const body = v.bodyObject(req.body);
    const allowed = ['nombre', 'apellido', 'objetivo', 'peso_actual', 'estatura', 'edad', 'sexo', 'nivel_actividad'];
    if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, 'El perfil contiene campos no permitidos.');
    const nombre = 'nombre' in body ? v.text(body.nombre, 'Nombre', 100) : previous.nombre;
    const apellido = 'apellido' in body ? v.optionalText(body.apellido, 'Apellido', 100) : previous.apellido;
    const objetivo = 'objetivo' in body ? v.goal(body.objetivo) : previous.objetivo;
    const peso = 'peso_actual' in body ? v.optionalNumber(body.peso_actual, 'Peso', 9999.99) : previous.peso_actual;
    const estatura = 'estatura' in body ? v.optionalNumber(body.estatura, 'Estatura', 999.99) : previous.estatura;
    let edad = previous.edad;
    if ('edad' in body) {
      const value = body.edad;
      if (value == null || value === '') edad = null;
      else if (typeof value !== 'number' || !Number.isInteger(value) || value < 19 || value > 120) throw new HttpError(400, 'La edad debe ser un número entero entre 19 y 120.');
      else edad = value;
    }
    let sexo = previous.sexo;
    if ('sexo' in body) {
      const value = body.sexo;
      if (value == null || value === '') sexo = null;
      else if (value !== 'femenino' && value !== 'masculino') throw new HttpError(400, 'Selecciona una opción válida para el cálculo.');
      else sexo = value;
    }
    let actividad = previous.nivel_actividad;
    if ('nivel_actividad' in body) {
      const value = body.nivel_actividad;
      if (value == null || value === '') actividad = null;
      else if (!['inactivo', 'bajo', 'activo', 'muy_activo'].includes(String(value))) throw new HttpError(400, 'Selecciona un nivel de actividad válido.');
      else actividad = String(value);
    }
    await pool.execute('UPDATE usuario SET nombre = ?, apellido = ?, objetivo = ?, peso_actual = ?, estatura = ?, edad = ?, sexo = ?, nivel_actividad = ? WHERE id_usuario = ?',
      [nombre, apellido, objetivo, peso, estatura, edad, sexo, actividad, res.locals.userId]);
    res.json(await getProfile(res.locals.userId));
  });

  app.post('/api/foods/scan-label', requireUser, uploadNutritionImage, async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Selecciona una foto de la tabla nutricional.');
    res.json(await readNutritionLabel(req.file.buffer));
  });

  app.get('/api/foods', async (req, res) => {
    if (req.query.q != null && typeof req.query.q !== 'string') throw new HttpError(400, 'La búsqueda no es válida.');
    const query = String(req.query.q ?? '').trim();
    if (query.length > 150) throw new HttpError(400, 'La búsqueda es demasiado larga.');
    const pattern = `%${query.replace(/[!%_]/g, '!$&')}%`;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_alimento, nombre, categoria, calorias_por_100g, proteinas, carbohidratos, grasas
       FROM alimento WHERE fuente_externa IS NULL AND nombre LIKE ? ESCAPE '!' ORDER BY nombre, id_alimento LIMIT 50`, [pattern],
    );
    res.json(rows);
  });

  app.get('/api/foods/search/usda', requireUser, async (req, res) => {
    if (req.query.q != null && typeof req.query.q !== 'string') throw new HttpError(400, 'La búsqueda no es válida.');
    const query = String(req.query.q ?? '').trim();
    if (query.length < 2 || query.length > 100) throw new HttpError(400, 'Escribe entre 2 y 100 caracteres para buscar.');
    res.json(await searchUsda(query));
  });

  app.use('/api', mealPlannerRouter);

  app.use((_req, _res, next) => next(new HttpError(404, 'La operación solicitada no existe.')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ message: error.message }); return; }
    if (error.code === 'ER_DUP_ENTRY') { res.status(409).json({ message: 'Ese correo ya está registrado.' }); return; }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') { res.status(404).json({ message: 'El alimento o plan seleccionado ya no está disponible.' }); return; }
    if (error.code === 'ER_SIGNAL_EXCEPTION') { res.status(400).json({ message: 'La operación no cumple las fechas o reglas del plan.' }); return; }
    if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || error.code === 'ER_DATA_TOO_LONG' || error.code === 'ER_DATA_OUT_OF_RANGE' || error.type === 'entity.parse.failed') {
      res.status(400).json({ message: 'Revisa los datos del formulario.' }); return;
    }
    if (error.type === 'entity.too.large') { res.status(413).json({ message: 'El formulario es demasiado grande.' }); return; }
    console.error('Solicitud fallida:', error.code ?? error.name ?? 'error');
    res.status(503).json({ message: 'No se pudo completar la operación. Intenta de nuevo.' });
  };
  app.use(errorHandler);
  return app;
}
