import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// SSL activado para producción/Supabase
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('supabase');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

export async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function auditLog({ userId, accion, tabla, registroId, antes = null, despues = null, ip = null }) {
  try {
    await pool.query(
      'INSERT INTO audit_logs(user_id, accion, tabla_afectada, registro_id, valores_anteriores, valores_nuevos, ip_address) VALUES($1, $2, $3, $4, $5, $6, $7)',
      [
        userId || null,
        accion,
        tabla,
        registroId || null,
        antes ? JSON.stringify(antes) : null,
        despues ? JSON.stringify(despues) : null,
        ip || null
      ]
    );

    // Mantenimiento de logs a 30 días
    await pool.query("DELETE FROM audit_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'").catch(() => {});
  } catch (_) {}
}

export function paginate(page = 1, perPage = 16) {
  const p = Math.max(1, parseInt(page) || 1);
  const pp = parseInt(perPage) || 16;
  return { limit: pp, offset: (p - 1) * pp, page: p, perPage: pp };
}
