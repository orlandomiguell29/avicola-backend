import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, auditLog } from '../db.js';
import { enrichUser } from '../middleware/auth.js';

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    // ✅ Corregido sintaxis PostgreSQL: usa $1 en lugar de ?
    const user = await queryOne('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!user.active) return res.status(403).json({ error: 'Usuario inactivo. Contacta al Administrador.' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });

    const isProd = process.env.NODE_ENV === 'production';

    // ✅ Corregido cookies para Vercel -> Render (sameSite: 'none' en producción)
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000
    });

    await auditLog({ userId: user.id, accion: 'LOGIN', tabla: 'users', registroId: user.id, ip: req.ip });
    const { password: _, ...u } = user;
    res.json({ user: enrichUser(u) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function logout(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
  });
  res.json({ ok: true });
}

export function me(req, res) {
  res.json(enrichUser(req.user));
}

export async function cambiarPassword(req, res) {
  try {
    const { password_actual, password_nuevo } = req.body;
    if (!password_nuevo || password_nuevo.length < 8) return res.status(400).json({ error: 'Mínimo 8 caracteres' });

    // ✅ Corregido sintaxis PostgreSQL: usa $1 y $2
    const user = await queryOne('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!await bcrypt.compare(password_actual, user.password)) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

    await queryOne('UPDATE users SET password = $1 WHERE id = $2', [await bcrypt.hash(password_nuevo, 12), req.user.id]);
    res.json({ ok: true, message: 'Contraseña actualizada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
