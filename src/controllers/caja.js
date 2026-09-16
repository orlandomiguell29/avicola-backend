import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, desde = '', hasta = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);

    let where = 'cm.deleted_at IS NULL';
    const params = [];

    if (desde) {
      params.push(desde);
      where += ` AND cm.fecha >= $${params.length}`;
    }
    if (hasta) {
      params.push(hasta);
      where += ` AND cm.fecha <= $${params.length}`;
    }

    // Consulta del total de registros
    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM cash_movements cm WHERE ${where}`,
      params
    );

    // Parámetros para LIMIT y OFFSET
    const listParams = [...params];
    listParams.push(limit);
    const limitIdx = listParams.length;
    listParams.push(offset);
    const offsetIdx = listParams.length;

    const rows = await query(
      `SELECT cm.*, u.name AS usuario_name 
       FROM cash_movements cm 
       LEFT JOIN users u ON u.id = cm.user_id 
       WHERE ${where} 
       ORDER BY cm.id DESC 
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams
    );

    res.json({
      data: rows,
      total: Number(total),
      page: p,
      pages: Math.ceil(Number(total) / perPage),
      perPage,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function create(req, res) {
  try {
    const { fecha, tipo, concepto, cantidad, precio_unitario } = req.body;
    const monto_total = Math.round(parseFloat(cantidad) * parseFloat(precio_unitario) * 100) / 100;

    // PostgreSQL requiere RETURNING id para obtener el ID generado
    const [result] = await query(
      `INSERT INTO cash_movements (fecha, tipo, concepto, cantidad, precio_unitario, monto_total, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [fecha, tipo, concepto, cantidad, precio_unitario, monto_total, req.user.id]
    );

    const insertedId = result.id;

    await auditLog({
      userId: req.user.id,
      accion: 'CREAR',
      tabla: 'cash_movements',
      registroId: insertedId,
      despues: { fecha, tipo, concepto, cantidad, precio_unitario, monto_total },
      ip: req.ip,
    });

    res.json({ ok: true, id: insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { fecha, tipo, concepto, cantidad, precio_unitario } = req.body;

    const antes = await queryOne(
      'SELECT * FROM cash_movements WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!antes) return res.status(404).json({ error: 'No encontrado' });

    const monto_total = Math.round(parseFloat(cantidad) * parseFloat(precio_unitario) * 100) / 100;

    await query(
      `UPDATE cash_movements 
       SET fecha = $1, tipo = $2, concepto = $3, cantidad = $4, precio_unitario = $5, monto_total = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $7`,
      [fecha, tipo, concepto, cantidad, precio_unitario, monto_total, id]
    );

    await auditLog({
      userId: req.user.id,
      accion: 'ACTUALIZAR',
      tabla: 'cash_movements',
      registroId: Number(id),
      antes,
      despues: { fecha, tipo, concepto, cantidad, precio_unitario, monto_total },
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;

    const antes = await queryOne(
      'SELECT * FROM cash_movements WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!antes) return res.status(404).json({ error: 'No encontrado' });

    await query('UPDATE cash_movements SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

    await auditLog({
      userId: req.user.id,
      accion: 'ELIMINAR',
      tabla: 'cash_movements',
      registroId: Number(id),
      antes,
      ip: req.ip,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
