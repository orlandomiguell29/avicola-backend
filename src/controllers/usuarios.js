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
    
    // Convertir a 1/0 para compatibilidad con smallint/integer en PostgreSQL
    const expVal = can_export ? 1 : 0;
    const edtVal = can_edit ? 1 : 0;
    const delVal = can_delete ? 1 : 0;

    // Inserción directa utilizando la secuencia nativa de la base de datos
    const [result] = await query(
      'INSERT INTO users(name, email, password, role, can_export, can_edit, can_delete, active) VALUES($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id',
      [name, email, hash, role, expVal, edtVal, delVal]
    );

    await auditLog({ 
      userId: req.user.id, 
      accion: 'CREAR', 
      tabla: 'users', 
      registroId: Number(result.id), 
      despues: { name, email, role }, 
      ip: req.ip 
    });

    res.json({ ok: true, id: Number(result.id) });
  } catch (e) { 
    console.error('Error create usuario:', e);
    res.status(500).json({ error: e.message }); 
  }
}

export async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, email, role, can_export = false, can_edit = false, can_delete = false, active = true, password = '' } = req.body;
    const antes = await queryOne('SELECT id,name,email,role,active FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    const existe = await queryOne('SELECT id FROM users WHERE email=$1 AND id!=$2', [email, id]);
    if (existe) return res.status(400).json({ error: 'El correo ya está en uso' });
    
    // Convertir flags a enteros 1/0 para PostgreSQL
    const expVal = can_export ? 1 : 0;
    const edtVal = can_edit ? 1 : 0;
    const delVal = can_delete ? 1 : 0;
    const actVal = active ? 1 : 0;

    let sql = 'UPDATE users SET name=$1,email=$2,role=$3,can_export=$4,can_edit=$5,can_delete=$6,active=$7,updated_at=CURRENT_TIMESTAMP';
    const params = [name, email, role, expVal, edtVal, delVal, actVal];
    
    if (password && password.length >= 8) { 
      sql += `,password=$${params.length + 1}`; 
      params.push(await bcrypt.hash(password, 12)); 
    }
    
    sql += ` WHERE id=$${params.length + 1}`; 
    params.push(id);
    
    await query(sql, params);
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'users', registroId: Number(id), antes, despues: { name, email, role, active: actVal }, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function remove(req, res) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) return res.status(400).json({ error: 'No puedes dar de baja tu propio usuario' });
    const antes = await queryOne('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!antes) return res.status(404).json({ error: 'No encontrado' });
    await query('UPDATE users SET active=0,deleted_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    await auditLog({ userId: req.user.id, accion: 'ELIMINAR', tabla: 'users', registroId: Number(id), antes, ip: req.ip });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
