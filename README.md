# Meal Planner

- `mobile/`: aplicación React Native con Expo SDK 58, TypeScript y Expo Router.
- `backend/`: API Node.js con autenticación y persistencia en MySQL.
- `database/`: esquema MySQL e instrucciones de instalación.
- `output/pdf/`: documentación del proyecto.

## Inicio rápido

En `backend/`, configura `.env` y ejecuta:

```powershell
npm run db:check
npm run dev
```

En otra terminal, inicia la aplicación:

```powershell
cd mobile
npm start
```

La aplicación permite gestionar cuentas y perfiles, alimentos, planes de comidas, historial de consumo y recetas. Consulta `backend/README.md`, `mobile/README.md` y `database/README.md` para conocer la configuración completa.
