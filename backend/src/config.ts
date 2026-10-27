function port(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} no es un puerto valido.`);
  return value;
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: port('PORT', 3000),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: port('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'meal_planner',
  },
  jwtSecret: process.env.JWT_SECRET ?? '',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(value => value.trim()).filter(Boolean),
};
