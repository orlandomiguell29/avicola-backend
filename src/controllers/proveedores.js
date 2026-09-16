import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, busqueda = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'deleted_at IS NULL'; const params = [];
    if (busqueda) {
      const b = `%${busqueda}%`;
      params.push(b, b, b);
      where += ` AND (nombre ILIKE $1 OR nit ILIKE $2 OR email ILIKE $3)`;
    }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM suppliers WHERE ${where}`, params);
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await query(`SELECT * FROM suppliers WHERE ${where} ORDER BY nombre LIMIT $${limitIdx} OFFSET $${offsetIdx}`, [...params, limit, offset]);
    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function listActivos(req, res) {
  try {
    // Evalúa verdadero tanto para booleano (true) como para entero (1)
    const rows = await query('SELECT id, nombre FROM suppliers WHERE (activo = true OR activo = 1) AND deleted_at IS NULL ORDER BY nombre');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { nombre, nit = '', telefono = '', email = '', contacto = '', direccion = '' } = req.body;
    const [result] = await query(
      'INSERT INTO suppliers(nombre,nit,telefono,email,contacto,direccion,activo) VALUES($1,$2,$3,$4,$5,$6,1) RETURNING id',
      [nombre, nit, telefono, email, contacto, direccion]
    );
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'suppliers', registroId: result.id, despues: req.body, ip: req.ip });
    res.json({ ok: true, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params; 
    const { nombre, nit = '', telefono = '', email = '', contacto = '', direccion = '', activo = true } = req.body;
    const antes = await queryOne('SELECT * FROM suppliers WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    
    const actVal = activo ? 1 : 0;
    await query(
      'UPDATE suppliers SET nombre=$1,nit=$2,telefono=$3,email=$4,contacto=$5,direccion=$6,activo=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8',
      [nombre, nit, telefono, email, contacto, direccion, actVal, id]
    );
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'suppliers', registroId: Number(id), antes, despues: req.body, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM suppliers WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE suppliers SET activo=0,deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'suppliers', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
