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
    const { name, email, password, role = 'USUARIO', can_export = false, can_edit = false, can_delete = false } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
    const existe = await queryOne('SELECT id FROM users WHERE email=$1', [email]);
    if (existe) return res.status(400).json({ error: 'El correo ya está en uso' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await query('INSERT INTO users(name,email,password,role,can_export,can_edit,can_delete,active)VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id',
      [name, email, hash, role, Boolean(can_export), Boolean(can_edit), Boolean(can_delete)]);
    await auditLog({ userId: req.user.id, accion: 'CREAR', tabla: 'users', registroId: result.id, despues: { name, email, role }, ip: req.ip });
    res.json({ ok: true, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, email, role, can_export = false, can_edit = false, can_delete = false, active = true, password = '' } = req.body;
    const antes = await queryOne('SELECT id,name,email,role,active FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const existe = await queryOne('SELECT id FROM users WHERE email=$1 AND id!=$2', [email, id]);
    if (existe) return res.status(400).json({ error: 'El correo ya está en uso' });
    
    let sql = 'UPDATE users SET name=$1,email=$2,role=$3,can_export=$4,can_edit=$5,can_delete=$6,active=$7,updated_at=CURRENT_TIMESTAMP';
    const params = [name, email, role, Boolean(can_export), Boolean(can_edit), Boolean(can_delete), Boolean(active)];
    
    if (password && password.length >= 8) { 
      sql += `,password=$${params.length + 1}`; 
      params.push(await bcrypt.hash(password, 12)); 
    }
    
    sql += ` WHERE id=$${params.length + 1}`; 
    params.push(id);
    
    await query(sql, params);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'users', registroId: Number(id), antes, despues: { name, email, role, active }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'No puedes dar de baja tu propio usuario' });
    const antes = await queryOne('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE users SET active=false,deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'users', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
