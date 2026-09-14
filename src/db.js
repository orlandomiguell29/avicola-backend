import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3308,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'avicola_flamencos',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '-05:00',
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function auditLog({ userId, accion, tabla, registroId, antes = null, despues = null, ip = null }) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs(user_id,accion,tabla_afectada,registro_id,valores_anteriores,valores_nuevos,ip_address) VALUES(?,?,?,?,?,?,?)',
      [userId || null, accion, tabla, registroId || null,
       antes ? JSON.stringify(antes) : null,
       despues ? JSON.stringify(despues) : null,
       ip || null]
    );
    // Mantener solo los últimos 30 días de logs
    await pool.execute("DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)").catch(() => {});
  } catch (_) {}
}

export function paginate(page = 1, perPage = 16) {
  const p = Math.max(1, parseInt(page) || 1);
  const pp = parseInt(perPage) || 16;
  return { limit: pp, offset: (p - 1) * pp, page: p, perPage: pp };
}
