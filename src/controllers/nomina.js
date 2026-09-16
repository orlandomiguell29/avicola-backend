import { query, queryOne, auditLog, paginate, pool } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'pe.deleted_at IS NULL'; const params = [];
    if (desde) { params.push(desde); where += ` AND pe.fecha>=$${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND pe.fecha<=$${params.length}`; }
    
    const [{ total }] = await query(`SELECT COUNT(*) total FROM payroll_entries pe WHERE ${where}`, params);
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await query(`SELECT pe.*,u.name usuario_name FROM payroll_entries pe LEFT JOIN users u ON u.id=pe.user_id WHERE ${where} ORDER BY pe.consecutivo DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { employee_id = '', fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Corrección: Se elimina 'FOR UPDATE' para evitar el conflicto con funciones agregadas de PostgreSQL
      const maxRes = await client.query('SELECT consecutivo FROM payroll_entries ORDER BY consecutivo DESC LIMIT 1');
      const consecutivo = maxRes.rows.length > 0 ? Number(maxRes.rows[0].consecutivo) + 1 : 1;
      
      const total_pagado = Math.round(parseFloat(cantidad_trabajada) * parseFloat(tarifa_aplicada) * 100) / 100;
      
      const insertRes = await client.query(
        'INSERT INTO payroll_entries(employee_id,consecutivo,fecha,nombre_empleado,tipo_empleado,base_periodo,cantidad_trabajada,tarifa_aplicada,total_pagado,user_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [employee_id || null, consecutivo, fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada, total_pagado, req.user.id]
      );
      await client.query('COMMIT');
      
      const newId = insertRes.rows[0].id;
      await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'payroll_entries', registroId: newId, despues: { ...req.body, consecutivo, total_pagado }, ip: req.ip });
      res.json({ ok: true, id: newId, consecutivo });
    } catch (e) { 
      await client.query('ROLLBACK'); 
      throw e; 
    } finally { 
      client.release(); 
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada } = req.body;
    const antes = await queryOne('SELECT * FROM payroll_entries WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const total_pagado = Math.round(parseFloat(cantidad_trabajada) * parseFloat(tarifa_aplicada) * 100) / 100;
    await query('UPDATE payroll_entries SET fecha=$1,nombre_empleado=$2,tipo_empleado=$3,base_periodo=$4,cantidad_trabajada=$5,tarifa_aplicada=$6,total_pagado=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8',
      [fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada, total_pagado, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'payroll_entries', registroId: Number(id), antes, despues: { ...req.body, total_pagado }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM payroll_entries WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE payroll_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'payroll_entries', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Comprobante: incluye datos de empresa para la colilla
export async function comprobante(req, res) {
  try {
    const row = await queryOne(
      'SELECT pe.*,u.name usuario_name FROM payroll_entries pe LEFT JOIN users u ON u.id=pe.user_id WHERE pe.id=$1 AND pe.deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    // Datos de empresa para el encabezado de la colilla
    const empresa = await queryOne('SELECT * FROM company_info LIMIT 1') || {};

    res.json({ ...row, empresa });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
