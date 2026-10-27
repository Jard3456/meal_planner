-- Meal Planner: creacion de base de datos y esquema inicial.
-- Motor: MySQL 8.0.16 o superior. Ejecutar completo en MySQL Workbench.
-- Conserva tablas y registros existentes; no sustituye una migracion de esquema.
-- Requiere permisos CREATE, INDEX, REFERENCES y TRIGGER en meal_planner.
-- Las contrasenas se convierten a hashes en el backend antes de insertarlas.

CREATE DATABASE IF NOT EXISTS meal_planner
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE meal_planner;
SET NAMES utf8mb4;

-- Las fechas de planes y consumos representan el dia local del usuario.
-- Los timestamps de creacion se consultan en UTC en esta conexion.
SET @mp_sql_mode_anterior = @@SESSION.sql_mode;
SET @mp_zona_anterior = @@SESSION.time_zone;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION time_zone = '+00:00';

-- 1. Cuenta, perfil personal y objetivo alimenticio.
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NULL,
    correo VARCHAR(254) COLLATE utf8mb4_0900_as_ci NOT NULL,
    password_hash VARCHAR(255) NOT NULL
        COMMENT 'Hash Argon2id o bcrypt producido por el backend; nunca texto plano',
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    objetivo VARCHAR(30) NULL
        COMMENT 'bajar_peso, aumentar_masa_muscular o mantener_peso',
    peso_actual DECIMAL(6,2) NULL COMMENT 'Kilogramos',
    estatura DECIMAL(5,2) NULL COMMENT 'Centimetros',
    edad TINYINT UNSIGNED NULL COMMENT 'Anos; solo adultos para estimacion calorica',
    sexo VARCHAR(12) NULL COMMENT 'femenino o masculino para ecuacion EER',
    nivel_actividad VARCHAR(16) NULL COMMENT 'inactivo, bajo, activo o muy_activo',

    PRIMARY KEY (id_usuario),
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT ck_usuario_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT ck_usuario_hash CHECK (CHAR_LENGTH(TRIM(password_hash)) > 0),
    CONSTRAINT ck_usuario_correo CHECK (
        correo LIKE '%_@_%._%' AND correo NOT LIKE '% %'
    ),
    CONSTRAINT ck_usuario_objetivo CHECK (
        objetivo IS NULL OR objetivo IN (
            'bajar_peso', 'aumentar_masa_muscular', 'mantener_peso'
        )
    ),
    CONSTRAINT ck_usuario_peso CHECK (peso_actual IS NULL OR peso_actual > 0),
    CONSTRAINT ck_usuario_estatura CHECK (estatura IS NULL OR estatura > 0),
    CONSTRAINT ck_usuario_edad CHECK (edad IS NULL OR edad BETWEEN 18 AND 120),
    CONSTRAINT ck_usuario_sexo CHECK (sexo IS NULL OR sexo IN ('femenino', 'masculino')),
    CONSTRAINT ck_usuario_actividad CHECK (nivel_actividad IS NULL OR nivel_actividad IN ('inactivo', 'bajo', 'activo', 'muy_activo'))
) ENGINE = InnoDB;

-- 2. Catalogo de alimentos. Los valores nutricionales desconocidos son NULL.
-- Energia en kcal/100 g; proteinas, carbohidratos y grasas en g/100 g.
CREATE TABLE IF NOT EXISTS alimento (
    id_alimento INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(80) NULL,
    calorias_por_100g DECIMAL(9,3) NULL,
    proteinas DECIMAL(7,3) NULL,
    carbohidratos DECIMAL(7,3) NULL,
    grasas DECIMAL(7,3) NULL,
    fuente_externa VARCHAR(20) NULL,
    id_fuente_externa VARCHAR(32) NULL,

    PRIMARY KEY (id_alimento),
    INDEX idx_alimento_nombre (nombre),
    UNIQUE KEY uq_alimento_fuente (fuente_externa, id_fuente_externa),
    CONSTRAINT ck_alimento_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT ck_alimento_calorias CHECK (
        calorias_por_100g IS NULL OR calorias_por_100g >= 0
    ),
    CONSTRAINT ck_alimento_proteinas CHECK (
        proteinas IS NULL OR proteinas BETWEEN 0 AND 100
    ),
    CONSTRAINT ck_alimento_carbohidratos CHECK (
        carbohidratos IS NULL OR carbohidratos BETWEEN 0 AND 100
    ),
    CONSTRAINT ck_alimento_grasas CHECK (
        grasas IS NULL OR grasas BETWEEN 0 AND 100
    )
) ENGINE = InnoDB;

-- 3. Planes diarios o semanales de cada usuario.
CREATE TABLE IF NOT EXISTS plan_comida (
    id_plan INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_usuario INT UNSIGNED NOT NULL,
    nombre_plan VARCHAR(150) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    observaciones TEXT NULL,

    PRIMARY KEY (id_plan),
    INDEX idx_plan_usuario_fechas (id_usuario, fecha_inicio, fecha_fin),
    CONSTRAINT fk_plan_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT ck_plan_nombre CHECK (CHAR_LENGTH(TRIM(nombre_plan)) > 0),
    CONSTRAINT ck_plan_fechas CHECK (fecha_fin >= fecha_inicio)
) ENGINE = InnoDB;

-- 4. Comidas programadas dentro de un plan.
CREATE TABLE IF NOT EXISTS comida (
    id_comida INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_plan INT UNSIGNED NOT NULL,
    tipo_comida VARCHAR(15) NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NULL,

    PRIMARY KEY (id_comida),
    INDEX idx_comida_plan_fecha (id_plan, fecha),
    CONSTRAINT fk_comida_plan FOREIGN KEY (id_plan)
        REFERENCES plan_comida (id_plan) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT ck_comida_tipo CHECK (
        tipo_comida IN ('desayuno', 'almuerzo', 'cena', 'snack')
    ),
    CONSTRAINT ck_comida_hora CHECK (
        hora IS NULL OR hora BETWEEN '00:00:00' AND '23:59:59'
    )
) ENGINE = InnoDB;

-- 5. Alimentos y cantidades que componen una comida planificada.
CREATE TABLE IF NOT EXISTS detalle_comida (
    id_detalle INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_comida INT UNSIGNED NOT NULL,
    id_alimento INT UNSIGNED NULL,
    nombre_alimento VARCHAR(150) NULL,
    categoria_alimento VARCHAR(80) NULL,
    calorias_por_100g DECIMAL(9,3) NULL,
    proteinas DECIMAL(7,3) NULL,
    carbohidratos DECIMAL(7,3) NULL,
    grasas DECIMAL(7,3) NULL,
    fuente_externa VARCHAR(20) NULL,
    id_fuente_externa VARCHAR(32) NULL,
    cantidad DECIMAL(10,3) NOT NULL,
    unidad_medida VARCHAR(10) NOT NULL,

    PRIMARY KEY (id_detalle),
    INDEX idx_detalle_comida (id_comida),
    INDEX idx_detalle_alimento (id_alimento),
    CONSTRAINT fk_detalle_comida FOREIGN KEY (id_comida)
        REFERENCES comida (id_comida) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_detalle_alimento FOREIGN KEY (id_alimento)
        REFERENCES alimento (id_alimento) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_detalle_cantidad CHECK (cantidad > 0),
    CONSTRAINT ck_detalle_food_ref CHECK (id_alimento IS NOT NULL OR nombre_alimento IS NOT NULL),
    CONSTRAINT ck_detalle_unidad CHECK (
        unidad_medida IN ('g', 'ml', 'porcion', 'unidad')
    )
) ENGINE = InnoDB;

-- 6. Consumo real del usuario, independiente de sus comidas planificadas.
-- calorias_totales es opcional: no convertir ml/porcion/unidad a gramos
-- sin una equivalencia validada. El backend conserva el valor historico.
CREATE TABLE IF NOT EXISTS consumo_alimento (
    id_consumo INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_usuario INT UNSIGNED NOT NULL,
    id_alimento INT UNSIGNED NULL,
    nombre_alimento VARCHAR(150) NULL,
    categoria_alimento VARCHAR(80) NULL,
    calorias_por_100g DECIMAL(9,3) NULL,
    proteinas DECIMAL(7,3) NULL,
    carbohidratos DECIMAL(7,3) NULL,
    grasas DECIMAL(7,3) NULL,
    fuente_externa VARCHAR(20) NULL,
    id_fuente_externa VARCHAR(32) NULL,
    fecha DATE NOT NULL,
    cantidad DECIMAL(10,3) NOT NULL,
    unidad_medida VARCHAR(10) NOT NULL,
    calorias_totales DECIMAL(12,3) NULL,

    PRIMARY KEY (id_consumo),
    INDEX idx_consumo_usuario_fecha (id_usuario, fecha),
    INDEX idx_consumo_alimento (id_alimento),
    CONSTRAINT fk_consumo_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_consumo_alimento FOREIGN KEY (id_alimento)
        REFERENCES alimento (id_alimento) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_consumo_cantidad CHECK (cantidad > 0),
    CONSTRAINT ck_consumo_food_ref CHECK (id_alimento IS NOT NULL OR nombre_alimento IS NOT NULL),
    CONSTRAINT ck_consumo_unidad CHECK (
        unidad_medida IN ('g', 'ml', 'porcion', 'unidad')
    ),
    CONSTRAINT ck_consumo_calorias CHECK (
        calorias_totales IS NULL OR calorias_totales >= 0
    )
) ENGINE = InnoDB;

-- 7. Recetas personales guardadas como favoritas, segun el modelo original.
CREATE TABLE IF NOT EXISTS receta (
    id_receta INT UNSIGNED NOT NULL AUTO_INCREMENT,
    id_usuario INT UNSIGNED NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    instrucciones TEXT NOT NULL,
    imagen_url VARCHAR(2048) NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id_receta),
    INDEX idx_receta_usuario_nombre (id_usuario, nombre),
    CONSTRAINT fk_receta_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT ck_receta_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
    CONSTRAINT ck_receta_instrucciones CHECK (
        CHAR_LENGTH(TRIM(instrucciones)) > 0
    )
) ENGINE = InnoDB;

-- Los triggers propios se recrean para permitir ejecutar nuevamente el archivo.
-- No se eliminan tablas ni registros. IF NOT EXISTS no actualiza tablas antiguas.
DELIMITER $$

DROP TRIGGER IF EXISTS bi_usuario_normalizar_correo$$
CREATE TRIGGER bi_usuario_normalizar_correo
BEFORE INSERT ON usuario FOR EACH ROW
BEGIN
    SET NEW.correo = LOWER(TRIM(NEW.correo));
END$$

DROP TRIGGER IF EXISTS bu_usuario_normalizar_correo$$
CREATE TRIGGER bu_usuario_normalizar_correo
BEFORE UPDATE ON usuario FOR EACH ROW
BEGIN
    SET NEW.correo = LOWER(TRIM(NEW.correo));
END$$

-- Se bloquea el plan durante la validacion para coordinar cambios concurrentes.
DROP TRIGGER IF EXISTS bi_comida_validar_fecha$$
CREATE TRIGGER bi_comida_validar_fecha
BEFORE INSERT ON comida FOR EACH ROW
BEGIN
    DECLARE v_inicio DATE DEFAULT NULL;
    DECLARE v_fin DATE DEFAULT NULL;

    SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
    FROM plan_comida WHERE id_plan = NEW.id_plan FOR SHARE;

    IF v_inicio IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El plan indicado no existe';
    END IF;
    IF NEW.fecha < v_inicio OR NEW.fecha > v_fin THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'La fecha de la comida debe estar dentro del plan';
    END IF;
END$$

DROP TRIGGER IF EXISTS bu_comida_validar_fecha$$
CREATE TRIGGER bu_comida_validar_fecha
BEFORE UPDATE ON comida FOR EACH ROW
BEGIN
    DECLARE v_inicio DATE DEFAULT NULL;
    DECLARE v_fin DATE DEFAULT NULL;

    SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
    FROM plan_comida WHERE id_plan = NEW.id_plan FOR SHARE;

    IF v_inicio IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El plan indicado no existe';
    END IF;
    IF NEW.fecha < v_inicio OR NEW.fecha > v_fin THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'La fecha de la comida debe estar dentro del plan';
    END IF;
END$$

-- Reducir el intervalo de un plan no puede dejar comidas fuera de sus fechas.
DROP TRIGGER IF EXISTS bu_plan_validar_comidas$$
CREATE TRIGGER bu_plan_validar_comidas
BEFORE UPDATE ON plan_comida FOR EACH ROW
BEGIN
    DECLARE v_comida_fuera INT UNSIGNED DEFAULT NULL;

    IF NEW.fecha_inicio <> OLD.fecha_inicio OR NEW.fecha_fin <> OLD.fecha_fin THEN
        SELECT id_comida INTO v_comida_fuera
        FROM comida
        WHERE id_plan = OLD.id_plan
          AND (fecha < NEW.fecha_inicio OR fecha > NEW.fecha_fin)
        ORDER BY id_comida LIMIT 1 FOR SHARE;

        IF v_comida_fuera IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'El intervalo nuevo excluye comidas existentes';
        END IF;
    END IF;
END$$

DELIMITER ;

SET SESSION sql_mode = @mp_sql_mode_anterior;
SET SESSION time_zone = @mp_zona_anterior;

-- Deben aparecer las siete tablas del modelo.
SHOW TABLES;
