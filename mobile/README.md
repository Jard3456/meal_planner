# Meal Planner móvil

Proyecto actualizado a Expo **SDK 58**, React Native **0.88**, React **19.3** y TypeScript. Las dependencias compatibles se resuelven con `npx expo install --fix` y quedan fijadas en `package-lock.json`.

## Iniciar

Las dependencias están instaladas en este entorno. En otra computadora, instala Node.js 22.13+ o 24.3+ (LTS), o Node.js 26+ y ejecuta `npm ci` dentro de esta carpeta.

```powershell
cd mobile
npm start -- --clear
```

Escanea el QR con una versión de Expo Go compatible con SDK 58. También puedes ejecutar `npm run android` (emulador configurado o dispositivo conectado) o `npm run web`. Para usar el simulador de iOS con `npm run ios` se necesita macOS. En Windows puede probarse un iPhone físico con Expo Go compatible o una compilación de desarrollo.

## Contenido y estado

- Inicio, Planificador, Historial, Recetas y Perfil con Expo Router.
- Pestañas nativas en Android/iOS y navegación equivalente en web.
- Pantallas iniciales en español, componentes reutilizables y áreas seguras.
- TypeScript estricto, cliente HTTP, autenticación y tipos alineados con el esquema MySQL.

Las cinco pantallas tienen flujos conectados a la API: Inicio muestra un resumen diario; Planificador permite crear, editar y eliminar planes y comidas, y agregar alimentos; Historial registra, edita y elimina consumos por fecha; Recetas muestra ideas locales por tipo de comida, ajustadas al perfil cuando hay datos disponibles, y permite crear, editar y eliminar recetas propias; Perfil registra cuentas, inicia sesión y guarda datos personales y objetivos. Cada tarjeta de sugerencia despliega su preparación con el botón «Más información». El formulario manual se despliega desde un botón. El catálogo permite consultar y agregar alimentos con sus valores nutricionales. Los cambios de cuenta se guardan en MySQL.

```text
src/
  app/          Rutas y pantallas
  components/   Componentes compartidos y navegación
  config/       Variables públicas del entorno
  constants/    Colores y estilos
  context/      Sesión y perfil compartidos
  hooks/        Hooks reutilizables
  services/     Cliente HTTP y operaciones del dominio
  types/        Tipos del dominio
```

## API y MySQL

Primero configura `backend/.env` con tu acceso a MySQL. Desde `backend/`, ejecuta `npm run db:init` si faltan las tablas, `npm run db:check` y `npm run dev`. Mantén esa terminal abierta y luego inicia Expo en otra terminal.

En desarrollo LAN, la app utiliza el equipo de Metro y el puerto `3000` de la API. Para otro host, puerto, túnel o producción, crea `.env.local` con `EXPO_PUBLIC_API_URL=https://tu-api/api` y reinicia Expo. Usa la misma red local para el teléfono y la computadora. El túnel de Metro no incluye la API.

La arquitectura es **Expo → API Node.js → MySQL**. Las credenciales MySQL pertenecen exclusivamente a `backend/.env`; nunca se agregan a variables públicas. Las sesiones nativas se conservan con SecureStore. En web se usa `sessionStorage` de la pestaña. Cada consulta de planes, consumos y recetas se limita al usuario autenticado. El catálogo de alimentos es compartido entre cuentas; los valores desconocidos se guardan como `NULL` y no se inventan.

Consulta `../backend/README.md` para conocer las rutas, configuración y límites. La conexión local confirmó MySQL y las siete tablas con `npm run db:check`.

## Comprobaciones

```powershell
npm run typecheck
npm run lint
npm run check:expo
```

Para exportar un bundle web sin publicarlo: `npx expo export --platform web`.

Referencias: [crear un proyecto](https://docs.expo.dev/get-started/create-a-project/), [SDK 58](https://expo.dev/changelog/sdk-58), [pestañas nativas](https://docs.expo.dev/router/advanced/native-tabs/) y [variables de entorno](https://docs.expo.dev/guides/environment-variables/).

Después de actualizar Expo Go o cambiar de SDK, detén el servidor anterior y ejecuta `npm start -- --clear` para iniciar Metro con la caché limpia. Vuelve a escanear el QR de este servidor.

## Validación de la migración a SDK 58

Comprobaciones realizadas el 24 de octubre de 2026:

- Expo 58.0.19, React Native 0.88.0, React 19.3.0 y Expo Router 58.0.26 instalados.
- `package-lock.json` coincide con las dependencias declaradas.
- TypeScript y ESLint sin errores.
- `expo install --check`: dependencias actualizadas y compatibles.
- Expo Doctor: 20 de 20 comprobaciones aprobadas.
- `expo export --platform all --clear`: bundles Android, iOS y web generados; cinco rutas de la aplicación y rutas auxiliares.
- Pestañas nativas migradas a `expo-router/native-tabs`; áreas seguras de web adaptadas a CSS, conservando las nativas.

La validación cubre tipos, configuración y exportación. La prueba en tu teléfono se realiza al abrir el nuevo QR con Expo Go SDK 58; no se ejecutó aquí un dispositivo ni se generaron instaladores para tiendas.

`npm audit` reporta 5 avisos de severidad alta en dependencias transitivas de Expo CLI, asociados a `node-forge` y `zod`. La propuesta automática incluye bajar Expo a otro SDK; se conserva SDK 58 y quedan pendientes parches compatibles. Los avisos moderados de `decode-uri-component` reportados con SDK 57 ya no aparecen en esta instalación.

## Integración con MySQL

Se añadieron la API Node.js, autenticación, perfil persistente, catálogo y almacenamiento de sesión. Backend y app pasan TypeScript; la app pasa ESLint y las 20 comprobaciones de Expo Doctor. Diez pruebas verificaron las operaciones de API y persistencia en una instancia MySQL 8.0.41 temporal aislada. No se utilizaron los registros de tu servidor para esas pruebas.

## Leer una tabla nutricional

Al agregar un alimento desde el catálogo, usa **Tomar foto** o **Elegir foto**. La API lee la etiqueta en español e inglés, completa los valores detectados y, si reconoce el tamaño de porción en gramos, los convierte a valores por 100 g. Revisa los campos y completa el nombre del alimento antes de guardar. La foto se envía a la API configurada y se procesa en memoria; el servidor necesita Internet para descargar los datos OCR la primera vez.
En **Historial** solo puedes registrar o editar consumos del día actual. Los días anteriores permanecen disponibles para consulta y eliminación de registros.
