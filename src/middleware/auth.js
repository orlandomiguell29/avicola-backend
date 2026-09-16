import jwt from 'jsonwebtoken';
import { queryOne } from '../db.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    
    const dec = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ Corregido sintaxis PostgreSQL: usa $1 en lugar de ?
    const user = await queryOne(
      'SELECT id, name, email, role, can_export, can_edit, can_delete, active FROM users WHERE id = $1 AND deleted_at IS NULL', 
      [dec.id]
    );
    
    if (!user || !user.active) return res.status(401).json({ error: 'Sesión inválida' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

export function requirePermission(tipo) {
  return (req, res, next) => {
    const u = req.user;
    if (u.role === 'ADMIN') return next();
    const ok = tipo === 'edit' ? u.can_edit : tipo === 'delete' ? u.can_delete : tipo === 'export' ? u.can_export : false;
    if (!ok) return res.status(403).json({ error: `Sin permiso para ${tipo}` });
    next();
  };
}

export function enrichUser(u) {
  return {
    ...u,
    es_admin: u.role === 'ADMIN',
    puede_editar: u.role === 'ADMIN' || !!u.can_edit,
    puede_eliminar: u.role === 'ADMIN' || !!u.can_delete,
    puede_exportar: u.role === 'ADMIN' || !!u.can_export
  };
}
