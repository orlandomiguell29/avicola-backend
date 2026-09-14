import { query, queryOne, auditLog, paginate, pool } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'pe.deleted_at IS NULL'; const params = [];
    if (desde) { where += ' AND pe.fecha>=?'; params.push(desde); }
    if (hasta) { where += ' AND pe.fecha<=?'; params.push(hasta); }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM payroll_entries pe WHERE ${where}`, params);
    const rows = await query(`SELECT pe.*,u.name usuario_name FROM payroll_entries pe LEFT JOIN users u ON u.id=pe.user_id WHERE ${where} ORDER BY pe.consecutivo DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { employee_id = '', fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada } = req.body;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [maxRows] = await conn.execute('SELECT COALESCE(MAX(consecutivo),0) max_c FROM payroll_entries FOR UPDATE');
      const consecutivo = Number(maxRows[0].max_c) + 1;
      const total_pagado = Math.round(parseFloat(cantidad_trabajada) * parseFloat(tarifa_aplicada) * 100) / 100;
      const [result] = await conn.execute(
        'INSERT INTO payroll_entries(employee_id,consecutivo,fecha,nombre_empleado,tipo_empleado,base_periodo,cantidad_trabajada,tarifa_aplicada,total_pagado,user_id)VALUES(?,?,?,?,?,?,?,?,?,?)',
        [employee_id || null, consecutivo, fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada, total_pagado, req.user.id]
      );
      await conn.commit();
      await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'payroll_entries', registroId: result.insertId, despues: { ...req.body, consecutivo, total_pagado }, ip: req.ip });
      res.json({ ok: true, id: result.insertId, consecutivo });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada } = req.body;
    const antes = await queryOne('SELECT * FROM payroll_entries WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const total_pagado = Math.round(parseFloat(cantidad_trabajada) * parseFloat(tarifa_aplicada) * 100) / 100;
    await query('UPDATE payroll_entries SET fecha=?,nombre_empleado=?,tipo_empleado=?,base_periodo=?,cantidad_trabajada=?,tarifa_aplicada=?,total_pagado=?,updated_at=NOW() WHERE id=?',
      [fecha, nombre_empleado, tipo_empleado, base_periodo, cantidad_trabajada, tarifa_aplicada, total_pagado, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'payroll_entries', registroId: Number(id), antes, despues: { ...req.body, total_pagado }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM payroll_entries WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE payroll_entries SET deleted_at=NOW() WHERE id=?', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'payroll_entries', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// Comprobante: incluye datos de empresa para la colilla
export async function comprobante(req, res) {
  try {
    const row = await queryOne(
      'SELECT pe.*,u.name usuario_name FROM payroll_entries pe LEFT JOIN users u ON u.id=pe.user_id WHERE pe.id=? AND pe.deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    // Datos de empresa para el encabezado de la colilla
    const empresa = await queryOne('SELECT * FROM company_info LIMIT 1') || {};

    res.json({ ...row, empresa });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
