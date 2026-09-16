import { query, auditLog } from '../db.js';
const CLAVES = ['tarifa_hora','tarifa_turno','tarifa_dia','tarifa_semana','tarifa_quincena','tarifa_mes'];

export async function get(req, res) {
  try {
    const rows = await query('SELECT clave,valor FROM settings');
    const obj = {};
    CLAVES.forEach(c => { obj[c] = 0; });
    rows.forEach(r => { if (CLAVES.includes(r.clave)) obj[r.clave] = Number(r.valor); });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const antes = await query('SELECT clave,valor FROM settings');
    for (const c of CLAVES) {
      if (req.body[c] !== undefined) {
        await query(
          'INSERT INTO settings(clave,valor) VALUES($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=$3, updated_at=CURRENT_TIMESTAMP',
          [c, req.body[c], req.body[c]]
        );
      }
    }
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'settings', antes: Object.fromEntries(antes.map(r => [r.clave, r.valor])), despues: req.body, ip: req.ip });
    res.json({ ok: true, message: 'Tarifas actualizadas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
