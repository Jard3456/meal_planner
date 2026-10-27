import type { RowDataPacket } from 'mysql2/promise';
import { pool } from './db.js';

const columns = 'id_usuario, nombre, apellido, correo, objetivo, peso_actual, estatura, edad, sexo, nivel_actividad';

export async function getProfile(id: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT ${columns} FROM usuario WHERE id_usuario = ?`, [id]);
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id_usuario: Number(row.id_usuario), nombre: String(row.nombre),
    apellido: row.apellido == null ? null : String(row.apellido), correo: String(row.correo),
    objetivo: row.objetivo == null ? null : String(row.objetivo),
    peso_actual: row.peso_actual == null ? null : Number(row.peso_actual),
    estatura: row.estatura == null ? null : Number(row.estatura),
    edad: row.edad == null ? null : Number(row.edad),
    sexo: row.sexo == null ? null : String(row.sexo),
    nivel_actividad: row.nivel_actividad == null ? null : String(row.nivel_actividad),
  };
}
