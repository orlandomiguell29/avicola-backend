import bcrypt from 'bcryptjs';
import { query, queryOne, auditLog } from '../db.js';

export async function list(req, res) {
  try {
    const rows = await query('SELECT id,name,email,role,can_export,can_edit,can_delete,active FROM users WHERE deleted_at IS NULL ORDER BY name');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function create(req, res) {
  try {
    const { name, email, password, role = 'USUARIO', can_export = 0, can_edit = 0, can_delete = 0 } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
    const existe = await queryOne('SELECT id FROM users WHERE email=?', [email]);
    if (existe) return res.status(400).json({ error: 'El correo ya está en uso' });
    const hash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users(name,email,password,role,can_export,can_edit,can_delete,active)VALUES(?,?,?,?,?,?,?,1)',
      [name, email, hash, role, can_export ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0]);
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'users', registroId: result.insertId, despues: { name, email, role }, ip: req.ip });
    res.json({ ok: true, id: result.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, email, role, can_export = 0, can_edit = 0, can_delete = 0, active = 1, password = '' } = req.body;
    const antes = await queryOne('SELECT id,name,email,role,active FROM users WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const existe = await queryOne('SELECT id FROM users WHERE email=? AND id!=?', [email, id]);
    if (existe) return res.status(400).json({ error: 'El correo ya está en uso' });
    let sql = 'UPDATE users SET name=?,email=?,role=?,can_export=?,can_edit=?,can_delete=?,active=?,updated_at=NOW()';
    const params = [name, email, role, can_export ? 1 : 0, can_edit ? 1 : 0, can_delete ? 1 : 0, active ? 1 : 0];
    if (password && password.length >= 8) { sql += ',password=?'; params.push(await bcrypt.hash(password, 12)); }
    sql += ' WHERE id=?'; params.push(id);
    await query(sql, params);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'users', registroId: Number(id), antes, despues: { name, email, role, active }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'No puedes dar de baja tu propio usuario' });
    const antes = await queryOne('SELECT * FROM users WHERE id=? AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE users SET active=0,deleted_at=NOW() WHERE id=?', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'users', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
