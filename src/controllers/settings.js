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
        const val = req.body[c];
        // Intenta actualizar si existe
        const updated = await query(
          'UPDATE settings SET valor=$1, updated_at=CURRENT_TIMESTAMP WHERE clave=$2 RETURNING id',
          [val, c]
        );
        
        // Si no existía el registro, se inserta asignando el siguiente ID disponible
        if (updated.length === 0) {
          await query(
            'INSERT INTO settings(id, clave, valor) VALUES((SELECT COALESCE(MAX(id), 0) + 1 FROM settings), $1, $2)',
            [c, val]
          );
        }
      }
    }
    await auditLog({ 
      userId: req.user.id, 
      accion: 'ACTUALIZAR', 
      tabla: 'settings', 
      antes: Object.fromEntries(antes.map(r => [r.clave, r.valor])), 
      despues: req.body, 
      ip: req.ip 
    });
    res.json({ ok: true, message: 'Tarifas actualizadas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
