import { pool } from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255) NOT NULL,email VARCHAR(255) NOT NULL UNIQUE,password VARCHAR(255) NOT NULL,role ENUM('ADMIN','USUARIO') NOT NULL DEFAULT 'USUARIO',can_export TINYINT(1) NOT NULL DEFAULT 0,can_edit TINYINT(1) NOT NULL DEFAULT 0,can_delete TINYINT(1) NOT NULL DEFAULT 0,active TINYINT(1) NOT NULL DEFAULT 1,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS cash_movements(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,fecha DATE NOT NULL,tipo ENUM('DEBE','HABER') NOT NULL,concepto VARCHAR(255) NOT NULL,cantidad DECIMAL(12,2) NOT NULL DEFAULT 1,precio_unitario DECIMAL(14,2) NOT NULL,monto_total DECIMAL(14,2) NOT NULL,user_id INT UNSIGNED NOT NULL,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(user_id)REFERENCES users(id)ON UPDATE CASCADE)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS suppliers(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,nombre VARCHAR(255) NOT NULL,nit VARCHAR(50) NULL,telefono VARCHAR(50) NULL,email VARCHAR(255) NULL,contacto VARCHAR(255) NULL,direccion VARCHAR(255) NULL,activo TINYINT(1) NOT NULL DEFAULT 1,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS supplier_invoices(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,supplier_id INT UNSIGNED NULL,fecha DATE NOT NULL,nombre_proveedor VARCHAR(255) NOT NULL,numero_factura VARCHAR(100) NOT NULL,descripcion_insumo VARCHAR(255) NOT NULL,cantidad DECIMAL(12,2) NOT NULL DEFAULT 1,costo_unitario DECIMAL(14,2) NOT NULL,costo_total DECIMAL(14,2) NOT NULL,user_id INT UNSIGNED NOT NULL,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(supplier_id)REFERENCES suppliers(id)ON DELETE SET NULL,FOREIGN KEY(user_id)REFERENCES users(id)ON UPDATE CASCADE)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS employees(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,nombre VARCHAR(255) NOT NULL,cedula VARCHAR(20) NULL,telefono VARCHAR(20) NULL,email VARCHAR(255) NULL,direccion VARCHAR(255) NULL,tipo ENUM('FIJO','POR_TURNO') NOT NULL DEFAULT 'FIJO',base_periodo ENUM('Hora','Turno','Dia','Semana','Quincena','Mes') NOT NULL DEFAULT 'Dia',tarifa_base DECIMAL(14,2) NOT NULL DEFAULT 0,fecha_ingreso DATE NULL,activo TINYINT(1) NOT NULL DEFAULT 1,observaciones TEXT NULL,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cedula(cedula))ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS payroll_entries(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,employee_id INT UNSIGNED NULL,consecutivo INT UNSIGNED NOT NULL,fecha DATE NOT NULL,nombre_empleado VARCHAR(255) NOT NULL,tipo_empleado ENUM('FIJO','POR_TURNO') NOT NULL,base_periodo ENUM('Hora','Turno','Dia','Semana','Quincena','Mes') NOT NULL,cantidad_trabajada DECIMAL(12,2) NOT NULL,tarifa_aplicada DECIMAL(14,2) NOT NULL,total_pagado DECIMAL(14,2) NOT NULL,user_id INT UNSIGNED NOT NULL,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_consecutivo(consecutivo),FOREIGN KEY(employee_id)REFERENCES employees(id)ON DELETE SET NULL,FOREIGN KEY(user_id)REFERENCES users(id)ON UPDATE CASCADE)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS settings(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,clave VARCHAR(100) NOT NULL UNIQUE,valor DECIMAL(14,2) NOT NULL DEFAULT 0,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS audit_logs(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id INT UNSIGNED NULL,accion VARCHAR(50) NOT NULL,tabla_afectada VARCHAR(100) NOT NULL,registro_id INT UNSIGNED NULL,valores_anteriores JSON NULL,valores_nuevos JSON NULL,ip_address VARCHAR(45) NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id)REFERENCES users(id)ON DELETE SET NULL)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS company_info(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,nombre_empresa VARCHAR(255) NOT NULL DEFAULT '',nit VARCHAR(50) NOT NULL DEFAULT '',telefono VARCHAR(50) NOT NULL DEFAULT '',email VARCHAR(255) NOT NULL DEFAULT '',ciudad VARCHAR(100) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

async function setup() {
  const conn = await pool.getConnection();
  try {
    for (const sql of TABLES) { await conn.execute(sql); }
    console.log('✅ Tablas creadas / verificadas');

    const [[existe]] = await conn.execute("SELECT id FROM users WHERE email='admin@losflamencos.test' LIMIT 1");
    if (!existe) {
      const hash = await bcrypt.hash('CambiarEstaClave123', 12);
      await conn.execute("INSERT INTO users(name,email,password,role,can_export,can_edit,can_delete,active)VALUES('Administrador','admin@losflamencos.test',?,'ADMIN',1,1,1,1)", [hash]);
      console.log('✅ Admin creado: admin@losflamencos.test / CambiarEstaClave123');
    } else { console.log('ℹ️  Admin ya existe, no se modificó'); }

    for (const c of ['tarifa_hora','tarifa_turno','tarifa_dia','tarifa_semana','tarifa_quincena','tarifa_mes']) {
      await conn.execute('INSERT IGNORE INTO settings(clave,valor)VALUES(?,0)', [c]);
    }

    const [[ci]] = await conn.execute('SELECT id FROM company_info LIMIT 1');
    if (!ci) {
      await conn.execute("INSERT INTO company_info(nombre_empresa,nit,telefono,email,ciudad)VALUES('Avícola y Miscelánea Los Flamencos','','','','')");
    }

    console.log('✅ Datos iniciales OK');
    console.log('\n🚀 Setup listo. Ejecuta: npm run dev');
  } finally { conn.release(); await pool.end(); }
}

setup().catch(e => { console.error('❌', e.message); process.exit(1); });
