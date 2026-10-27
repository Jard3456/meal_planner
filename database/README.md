# Base de datos de Meal Planner

`meal_planner_mysql.sql` crea la base `meal_planner` y las siete tablas del modelo: `usuario`, `alimento`, `plan_comida`, `comida`, `detalle_comida`, `consumo_alimento` y `receta`.

## Ejecución en MySQL Workbench

1. Conéctate a un servidor MySQL **8.0.16 o superior** con permisos para crear la base, tablas y triggers.
2. Abre `meal_planner_mysql.sql` mediante **File > Open SQL Script**.
3. Ejecuta el archivo completo con el botón del rayo, sin seleccionar solo una parte.
4. Actualiza **Schemas** y abre `meal_planner`. La consulta final muestra las siete tablas.

También puedes abrir el cliente de MySQL y ejecutar:

```sql
SOURCE C:/Users/jrodr/Desktop/tareas/meal_planner/database/meal_planner_mysql.sql;
```

El script no contiene `DROP DATABASE`, `DROP TABLE` ni datos de prueba. Se puede repetir sobre el esquema que crea: conserva los datos y recrea sus cinco triggers. `IF NOT EXISTS` no adapta tablas preexistentes con otra estructura; los cambios posteriores requieren migraciones. MySQL confirma las operaciones DDL por separado: si ocurre un error, corrígelo antes de continuar.

## Decisiones del diseño

- El correo se guarda sin espacios exteriores y en minúsculas. Es único sin distinguir mayúsculas; sus acentos sí se distinguen. La comprobación SQL del formato es básica; el backend debe validar el correo completo.
- `password_hash` reemplaza el campo conceptual de contraseña. El backend genera un hash Argon2id o bcrypt antes de insertarlo; SQL no implementa el inicio de sesión ni verifica que una cadena sea un hash válido.
- `peso_actual` se expresa en **kg** y `estatura` en **cm**. Ambos y el objetivo pueden quedar vacíos mientras se completa el perfil.
- Objetivos permitidos: `bajar_peso`, `aumentar_masa_muscular` y `mantener_peso`.
- Tipos de comida: `desayuno`, `almuerzo`, `cena` y `snack`. Cantidades positivas; unidades `g`, `ml`, `porcion` o `unidad`.
- Las calorías del catálogo se expresan en **kcal por 100 g**; los macronutrientes en **g por 100 g**. Los valores desconocidos permanecen `NULL`. `calorias_totales` puede ser `NULL` y, si se utiliza, lo calcula el backend con equivalencias válidas. No se recalculan consumos históricos al editar el catálogo.
- Los planes y consumos usan fechas de calendario locales. La conexión del backend debe configurar UTC para consultar los timestamps de creación de forma uniforme.
- Los triggers comprueban que una comida esté dentro de su plan y que cambiar las fechas del plan no excluya comidas existentes.
- Eliminar una cuenta elimina sus planes, comidas, detalles, consumos y recetas. Eliminar una comida elimina sus detalles. No se puede eliminar un alimento referenciado por detalles o consumos.
- Las recetas son favoritas personales asociadas al usuario, como en el modelo documentado. No se agrega un catálogo compartido ni ingredientes de receta.
- Crear un plan no crea consumos. La API debe comprobar qué usuario tiene acceso a cada registro y guardar operaciones relacionadas dentro de una transacción; las claves foráneas no sustituyen la autorización.

Referencias de sintaxis: [CREATE DATABASE](https://dev.mysql.com/doc/refman/8.0/en/create-database.html), [restricciones CHECK](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html) y [triggers](https://dev.mysql.com/doc/refman/8.0/en/trigger-syntax.html), documentación oficial de MySQL.
