import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'si.deleted_at IS NULL'; const params = [];
    if (desde) { where += ' AND si.fecha>=?'; params.push(desde); }
    if (hasta) { where += ' AND si.fecha<=?'; params.push(hasta); }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM supplier_invoices si WHERE ${where}`, params);
    const rows = await query(`SELECT si.*,u.name usuario_name FROM supplier_invoices si LEFT JOIN users u ON u.id=si.user_id WHERE ${where} ORDER BY si.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { fecha, supplier_id, numero_factura, descripcion_insumo, cantidad, costo_unitario } = req.body;
    const prov = await queryOne('SELECT nombre FROM suppliers WHERE id=? AND activo=1', [supplier_id]);
    if (!prov) return res.status(400).json({ error: 'Proveedor no encontrado' });
    const costo_total = Math.round(parseFloat(cantidad) * parseFloat(costo_unitario) * 100) / 100;
    const result = await query('INSERT INTO supplier_invoices(supplier_id,fecha,nombre_proveedor,numero_factura,descripcion_insumo,cantidad,costo_unitario,costo_total,user_id)VALUES(?,?,?,?,?,?,?,?,?)',
      [supplier_id, fecha, prov.nombre, numero_factura, descripcion_insumo, cantidad, costo_unitario, costo_total, req.user.id]);
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'supplier_invoices', registroId: result.insertId, despues: req.body, ip: req.ip });
    res.json({ ok: true, id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params; const { fecha, supplier_id, numero_factura, descripcion_insumo, cantidad, costo_unitario } = req.body;
    const antes = await queryOne('SELECT * FROM supplier_invoices WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const prov = await queryOne('SELECT nombre FROM suppliers WHERE id=?', [supplier_id]);
    const costo_total = Math.round(parseFloat(cantidad) * parseFloat(costo_unitario) * 100) / 100;
    await query('UPDATE supplier_invoices SET supplier_id=?,fecha=?,nombre_proveedor=?,numero_factura=?,descripcion_insumo=?,cantidad=?,costo_unitario=?,costo_total=?,updated_at=NOW() WHERE id=?',
      [supplier_id, fecha, prov.nombre, numero_factura, descripcion_insumo, cantidad, costo_unitario, costo_total, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'supplier_invoices', registroId: Number(id), antes, despues: req.body, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM supplier_invoices WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE supplier_invoices SET deleted_at=NOW() WHERE id=?', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'supplier_invoices', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
