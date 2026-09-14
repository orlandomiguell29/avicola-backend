import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, busqueda = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'deleted_at IS NULL'; const params = [];
    if (busqueda) { where += ' AND (nombre LIKE ? OR nit LIKE ? OR email LIKE ?)'; const b = `%${busqueda}%`; params.push(b, b, b); }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM suppliers WHERE ${where}`, params);
    const rows = await query(`SELECT * FROM suppliers WHERE ${where} ORDER BY nombre LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function listActivos(req, res) {
  try {
    const rows = await query('SELECT id,nombre FROM suppliers WHERE activo=1 AND deleted_at IS NULL ORDER BY nombre');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { nombre, nit = '', telefono = '', email = '', contacto = '', direccion = '' } = req.body;
    const result = await query('INSERT INTO suppliers(nombre,nit,telefono,email,contacto,direccion,activo)VALUES(?,?,?,?,?,?,1)',
      [nombre, nit, telefono, email, contacto, direccion]);
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'suppliers', registroId: result.insertId, despues: req.body, ip: req.ip });
    res.json({ ok: true, id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params; const { nombre, nit = '', telefono = '', email = '', contacto = '', direccion = '', activo = 1 } = req.body;
    const antes = await queryOne('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE suppliers SET nombre=?,nit=?,telefono=?,email=?,contacto=?,direccion=?,activo=?,updated_at=NOW() WHERE id=?',
      [nombre, nit, telefono, email, contacto, direccion, activo, id]);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'suppliers', registroId: Number(id), antes, despues: req.body, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM suppliers WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE suppliers SET activo=0,deleted_at=NOW() WHERE id=?', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'suppliers', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
