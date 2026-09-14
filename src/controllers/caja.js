import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'cm.deleted_at IS NULL'; const params = [];
    if (desde) { where += ' AND cm.fecha>=?'; params.push(desde); }
    if (hasta) { where += ' AND cm.fecha<=?'; params.push(hasta); }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM cash_movements cm WHERE ${where}`, params);
    const rows = await query(`SELECT cm.*,u.name usuario_name FROM cash_movements cm LEFT JOIN users u ON u.id=cm.user_id WHERE ${where} ORDER BY cm.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { fecha, tipo, concepto, cantidad, precio_unitario } = req.body;
    const monto_total = Math.round(parseFloat(cantidad) * parseFloat(precio_unitario) * 100) / 100;
    const result = await query('INSERT INTO cash_movements(fecha,tipo,concepto,cantidad,precio_unitario,monto_total,user_id)VALUES(?,?,?,?,?,?,?)',
      [fecha, tipo, concepto, cantidad, precio_unitario, monto_total, req.user.id]);
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'cash_movements', registroId: result.insertId, despues: { fecha, tipo, concepto, cantidad, precio_unitario, monto_total }, ip: req.ip });
    res.json({ ok: true, id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params; const { fecha, tipo, concepto, cantidad, precio_unitario } = req.body;
    const antes = await queryOne('SELECT * FROM cash_movements WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const monto_total = Math.round(parseFloat(cantidad) * parseFloat(precio_unitario) * 100) / 100;
    await query('UPDATE cash_movements SET fecha=?,tipo=?,concepto=?,cantidad=?,precio_unitario=?,monto_total=?,updated_at=NOW() WHERE id=?',
      [fecha, tipo, concepto, cantidad, precio_unitario, monto_total, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'cash_movements', registroId: Number(id), antes, despues: { fecha, tipo, concepto, cantidad, precio_unitario, monto_total }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM cash_movements WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE cash_movements SET deleted_at=NOW() WHERE id=?', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'cash_movements', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
