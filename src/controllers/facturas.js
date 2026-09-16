import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'si.deleted_at IS NULL'; const params = [];
    if (desde) { params.push(desde); where += ` AND si.fecha>=$${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND si.fecha<=$${params.length}`; }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM supplier_invoices si WHERE ${where}`, params);
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await query(`SELECT si.*,u.name usuario_name FROM supplier_invoices si LEFT JOIN users u ON u.id=si.user_id WHERE ${where} ORDER BY si.id DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { fecha, supplier_id, numero_factura, descripcion_insumo, cantidad, costo_unitario } = req.body;
    
    // Verificación exacta usando únicamente entero (activo = 1) o IS NULL para evitar el choque con tipo boolean
    const prov = await queryOne('SELECT nombre FROM suppliers WHERE id=$1 AND (activo = 1 OR activo IS NULL) AND deleted_at IS NULL', [supplier_id]);
    if (!prov) return res.status(400).json({ error: 'Proveedor no encontrado o inactivo' });
    
    const costo_total = Math.round(parseFloat(cantidad) * parseFloat(costo_unitario) * 100) / 100;
    
    // Insert con autogeneración explícita de ID para evitar 'null value in column "id"'
    const [result] = await query(
      `INSERT INTO supplier_invoices(id, supplier_id, fecha, nombre_proveedor, numero_factura, descripcion_insumo, cantidad, costo_unitario, costo_total, user_id) 
       VALUES((SELECT COALESCE(MAX(id), 0) + 1 FROM supplier_invoices), $1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id`,
      [supplier_id, fecha, prov.nombre, numero_factura, descripcion_insumo, cantidad, costo_unitario, costo_total, req.user.id]
    );

    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'supplier_invoices', registroId: result.id, despues: req.body, ip: req.ip });
    res.json({ ok: true, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params; const { fecha, supplier_id, numero_factura, descripcion_insumo, cantidad, costo_unitario } = req.body;
    const antes = await queryOne('SELECT * FROM supplier_invoices WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const prov = await queryOne('SELECT nombre FROM suppliers WHERE id=$1', [supplier_id]);
    const costo_total = Math.round(parseFloat(cantidad) * parseFloat(costo_unitario) * 100) / 100;
    await query('UPDATE supplier_invoices SET supplier_id=$1,fecha=$2,nombre_proveedor=$3,numero_factura=$4,descripcion_insumo=$5,cantidad=$6,costo_unitario=$7,costo_total=$8,updated_at=CURRENT_TIMESTAMP WHERE id=$9',
      [supplier_id, fecha, prov.nombre, numero_factura, descripcion_insumo, cantidad, costo_unitario, costo_total, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'supplier_invoices', registroId: Number(id), antes, despues: req.body, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM supplier_invoices WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE supplier_invoices SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'supplier_invoices', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
