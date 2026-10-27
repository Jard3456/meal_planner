# Meal Planner API

API Node.js + TypeScript + Express + MySQL2 que conecta la app Expo con MySQL. Las credenciales se leen únicamente desde `backend/.env`, ignorado por Git.

## Configurar y conectar

1. Completa `DB_HOST`, `DB_PORT`, `DB_USER` y `DB_PASSWORD` en `.env`. Si el archivo no existe, copia `.env.example` y genera también `JWT_SECRET` (al menos 32 caracteres aleatorios privados).
2. Para habilitar la búsqueda USDA, crea una clave gratuita de FoodData Central y configúrala como `USDA_API_KEY` en `backend/.env`. La clave solo se usa en el servidor y no debe agregarse a la app móvil ni al repositorio. Open Food Facts no requiere clave para consultas de lectura.
3. Desde `backend/`, ejecuta `npm ci` si no están instaladas las dependencias.
4. Si todavía no creaste las tablas, ejecuta `npm run db:init`. Se utiliza el script `../database/meal_planner_mysql.sql`; conserva tablas y registros, y recrea sus triggers. No adapta estructuras antiguas diferentes.
5. Ejecuta `npm run db:check` para comprobar credenciales, base y las siete tablas.
6. Inicia la API con `npm run dev`.

```powershell
cd backend
npm run db:init
npm run db:check
npm run dev
```

`db:init` necesita el cliente de MySQL y permisos para crear la base, tablas y triggers. Detecta la ubicación habitual de MySQL 8.0 en Windows; en otra instalación puedes definir `MYSQL_BIN` en `.env`. Nunca se incluye la contraseña como argumento de consola.

`JWT_SECRET` ya se generó para el entorno local creado durante esta tarea. Consérvala privada. Si la cambias, las sesiones emitidas dejan de ser válidas.

## Conexión desde Expo

En otra terminal, desde la raíz:

```powershell
cd mobile
npm start -- --clear
```

En desarrollo LAN la app toma el equipo de Metro y utiliza su puerto `3000` para la API. Usa el mismo Wi-Fi en el teléfono y la computadora. El servidor escucha en `0.0.0.0`; Windows debe permitir sus conexiones entrantes si se usa un teléfono físico. No se modificaron las reglas del firewall.

Si la API usa otro equipo, puerto, HTTPS o un túnel separado, define `EXPO_PUBLIC_API_URL` en `mobile/.env.local`. El túnel de Expo solo transporta Metro, no esta API. En producción, configura una URL HTTPS explícita. Las credenciales MySQL nunca van en el cliente.

Para web, `CORS_ORIGINS` lista los orígenes admitidos separados por comas. Los valores iniciales permiten Expo web en `http://localhost:8081` y `http://127.0.0.1:8081`. Añade el origen exacto si usas otro host o puerto. Las apps nativas no envían el encabezado `Origin`.

## Operaciones conectadas

| Método y ruta | Función |
| --- | --- |
| `GET /api/health` | Comprueba que MySQL responde. |
| `POST /api/auth/register` | Crea una cuenta con `nombre`, `apellido` opcional, `correo` y `password`. |
| `POST /api/auth/login` | Autentica correo y contraseña. |
| `GET /api/me` | Consulta el perfil de la cuenta autenticada. |
| `PATCH /api/me` | Actualiza nombre, apellido, objetivo, peso y estatura de esa cuenta. |
| `GET /api/foods?q=texto` | Consulta hasta 50 alimentos reales del catálogo. |
| `POST /api/foods` | Agrega alimento y datos nutricionales al catálogo compartido. |
| `GET /api/foods/search/usda?q=texto` | Busca alimentos y productos de marca en USDA FoodData Central (requiere sesión y `USDA_API_KEY`). |
| `GET /api/foods/search/openfoodfacts?barcode=...` | Consulta un producto empacado por código de barras en Open Food Facts (requiere sesión). |
| `POST /api/foods/resolve` | Guarda o recupera el producto externo para usarlo en planes e historial; no lo muestra en el catálogo local. |
| `GET /api/dashboard?fecha=AAAA-MM-DD` | Resumen de calorías, consumos, comidas y recetas del usuario. |
| `GET /api/plans?from=…&to=…` | Consulta planes y sus comidas/alimentos en el intervalo. |
| `POST /api/plans`, `PUT/DELETE /api/plans/:id` | Crea, edita y elimina planes propios. |
| `POST /api/plans/:id/meals`, `PUT/DELETE /api/meals/:id` | Agrega, edita y elimina comidas dentro de planes propios. |
| `POST /api/meals/:id/foods`, `DELETE /api/meal-foods/:id` | Agrega y quita alimentos planificados. |
| `GET /api/consumptions?from=…&to=…` | Consulta el historial propio por fechas. |
| `POST /api/consumptions`, `PUT/DELETE /api/consumptions/:id` | Registra, edita y elimina consumos propios. |
| `GET/POST /api/recipes`, `PUT/DELETE /api/recipes/:id` | Administra recetas de la cuenta autenticada. |

Las rutas `/me` requieren `Authorization: Bearer <token>`. El identificador se obtiene del token validado; el cliente no puede elegir el perfil de otro usuario. Las contraseñas se guardan como hashes bcrypt y no se devuelven. Peso y estatura se serializan como números o `null`. Las consultas reciben parámetros preparados.

Inicio presenta el resumen diario; Planificador gestiona planes, comidas y alimentos; Historial gestiona consumos por día; Recetas administra la colección personal; Perfil gestiona la cuenta y sus datos. Crear un alimento requiere sesión y agrega una entrada al catálogo compartido. Calorías se calculan automáticamente solo cuando la cantidad está en gramos y existe energía por 100 g; para otras unidades se pueden indicar manualmente.

La sesión JWT dura ocho horas. Se guarda en SecureStore en Android/iOS y en `sessionStorage` de la pestaña web. Cerrar sesión elimina la credencial local; el token ya emitido conserva su vigencia hasta vencer. No se implementaron renovación ni revocación remota. Esta configuración corresponde al desarrollo local.

## Compilar y probar

```powershell
npm run typecheck
npm run build
npm test
```

`npm start` ejecuta `dist/server.js` después de compilar. La API verifica la conexión y el esquema antes de aceptar solicitudes.

`npm test` ejecuta validaciones sin modificar la base configurada. La prueba de integración se omite salvo que se definan `MP_TEST_DB=1` y un `DB_NAME` con prefijo `meal_planner_qa_`. La integración debe ejecutarse en una instancia aislada con el esquema creado; utiliza y elimina únicamente sus propias cuentas y alimentos de prueba.

El esquema de esta instalación quedó accesible y `npm run db:check` confirmó las siete tablas de MySQL. Los campos de alimentos se comparten entre usuarios; los planes, consumos y recetas se aíslan por cuenta.

## Lectura de tablas nutricionales

En el catálogo de alimentos puedes tomar una foto o elegirla de la galería para extraer calorías y macronutrientes. El OCR se ejecuta en la API con Tesseract.js y los idiomas español e inglés. La primera lectura descarga los datos de idioma, así que el servidor necesita acceso a Internet en ese momento. Las imágenes se procesan en memoria y no se guardan. Se aceptan JPG, PNG y WebP de hasta 5 MB. Revisa y corrige siempre los valores detectados antes de guardar.

El catálogo permite buscar en USDA FoodData Central por nombre y consultar Open Food Facts con el código de barras escrito o escaneado. Al seleccionar un resultado externo, se guarda en `alimento` con su fuente y código para que planes e historial lo usen; la consulta local filtra esas filas y muestra solo alimentos agregados manualmente. Los productos importados antes de añadir el marcador de fuente se clasifican por su categoría al iniciar el backend y también quedan fuera de esa lista. El backend añade automáticamente las columnas necesarias y conserva los registros existentes. Los datos de Open Food Facts son colaborativos y pueden estar incompletos; su base se publica bajo ODbL, que requiere atribución y compartir bases derivadas bajo las condiciones de esa licencia. Revisa sus [condiciones de reutilización](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/) antes de distribuir una versión que incluya datos importados.
Los consumos nuevos y sus modificaciones se aceptan únicamente para la fecha actual. La zona horaria se configura con `APP_TIME_ZONE` y por defecto es `America/Guatemala`.
