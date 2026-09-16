import { query, queryOne, auditLog, paginate } from '../db.js';

export async function list(req, res) {
  try {
    const { page = 1, busqueda = '' } = req.query;
    const { limit, offset, page: p, perPage } = paginate(page);
    let where = 'e.deleted_at IS NULL';
    const params = [];
    if (busqueda) {
      const b = `%${busqueda}%`;
      params.push(b, b, b);
      where += ` AND (e.nombre ILIKE $1 OR e.cedula ILIKE $2 OR e.email ILIKE $3)`;
    }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM employees e WHERE ${where}`, params);
    
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await query(
      `SELECT e.* FROM employees e WHERE ${where} ORDER BY e.nombre LIMIT $${limitIdx} OFFSET $${offsetIdx}`, 
      [...params, limit, offset]
    );

    if (rows.length > 0) {
      const ids = rows.map(e => e.id);
      const ph = ids.map((_, i) => `$${i + 1}`).join(',');
      const totales = await query(
        `SELECT employee_id, COALESCE(SUM(total_pagado),0) total FROM payroll_entries WHERE employee_id IN (${ph}) AND deleted_at IS NULL GROUP BY employee_id`,
        ids
      );
      const mapa = {};
      totales.forEach(t => { mapa[Number(t.employee_id)] = Number(t.total); });
      rows.forEach(e => { e.total_pagado = mapa[Number(e.id)] || 0; });
    } else {
      rows.forEach(e => { e.total_pagado = 0; });
    }

    res.json({ data: rows, total: Number(total), page: p, pages: Math.ceil(Number(total) / perPage), perPage });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function listActivos(req, res) {
  try {
    const rows = await query(
      `SELECT id, nombre, tipo, base_periodo, tarifa_base 
       FROM employees 
       WHERE (activo = 1 OR activo IS NULL) AND deleted_at IS NULL 
       ORDER BY nombre`
    );
    res.json(rows);
  } catch (e) { 
    console.error('Error listActivos empleados:', e);
    res.status(500).json({ error: e.message }); 
  }
}

export async function create(req, res) {
  try {
    const { 
      nombre, 
      cedula = null, 
      telefono = null, 
      email = null, 
      direccion = null, 
      tipo = 'FIJO', 
      base_periodo = 'Mes', 
      tarifa_base = 0, 
      fecha_ingreso = null, 
      observaciones = null 
    } = req.body;

    // Inserción directa sin subconsulta MAX para prevenir errores de agregación en transacciones
    const [result] = await query(
      `INSERT INTO employees (
        nombre, cedula, telefono, email, direccion, tipo, base_periodo, tarifa_base, fecha_ingreso, activo, observaciones
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10
      ) RETURNING id`,
      [
        nombre,
        cedula || null,
        telefono || null,
        email || null,
        direccion || null,
        tipo,
        base_periodo,
        Number(tarifa_base) || 0,
        fecha_ingreso || null,
        observaciones || null
      ]
    );

    await auditLog({ 
      userId: req.user.id, 
      accion: 'CREAR', 
      tabla: 'employees', 
      registroId: Number(result.id), 
      despues: req.body, 
      ip: req.ip 
    });

    res.json({ ok: true, id: Number(result.id) });
  } catch (e) { 
    console.error('Error create empleado:', e);
    res.status(500).json({ error: e.message }); 
  }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { 
      nombre, 
      cedula = null, 
      telefono = null, 
      email = null, 
      direccion = null, 
      tipo, 
      base_periodo, 
      tarifa_base, 
      fecha_ingreso = null, 
      activo = 1, 
      observaciones = null 
    } = req.body;

    const antes = await queryOne('SELECT * FROM employees WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });

    const actVal = (activo === true || activo === 1 || activo === '1') ? 1 : 0;

    await query(
      `UPDATE employees SET 
        nombre=$1, cedula=$2, telefono=$3, email=$4, direccion=$5, tipo=$6, base_periodo=$7, 
        tarifa_base=$8, fecha_ingreso=$9, activo=$10, observaciones=$11, updated_at=CURRENT_TIMESTAMP 
       WHERE id=$12`,
      [
        nombre, 
        cedula || null, 
        telefono || null, 
        email || null, 
        direccion || null, 
        tipo, 
        base_periodo, 
        Number(tarifa_base) || 0, 
        fecha_ingreso || null, 
        actVal, 
        observaciones || null, 
        id
      ]
    );

    await auditLog({ 
      userId: req.user.id, 
      accion: 'ACTUALIZAR', 
      tabla: 'employees', 
      registroId: Number(id), 
      antes, 
      despues: req.body, 
      ip: req.ip 
    });

    res.json({ ok: true });
  } catch (e) { 
    console.error('Error update empleado:', e);
    res.status(500).json({ error: e.message }); 
  }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    const antes = await queryOne('SELECT * FROM employees WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });

    await query('UPDATE employees SET activo=0, deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'employees', registroId: Number(id), antes, ip: req.ip });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
