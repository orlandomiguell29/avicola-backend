import { query, auditLog } from '../db.js';

export async function get(req, res) {
  try {
    const rows = await query('SELECT * FROM company_info LIMIT 1');
    res.json(rows[0] || { nombre_empresa: '', nit: '', telefono: '', email: '', ciudad: '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function update(req, res) {
  try {
    const { nombre_empresa = '', nit = '', telefono = '', email = '', ciudad = '' } = req.body;
    const existe = await query('SELECT id FROM company_info LIMIT 1');
    const antes = existe[0] || {};
    if (existe.length === 0) {
      await query('INSERT INTO company_info(nombre_empresa,nit,telefono,email,ciudad)VALUES($1,$2,$3,$4,$5)',
        [nombre_empresa, nit, telefono, email, ciudad]);
    } else {
      await query('UPDATE company_info SET nombre_empresa=$1,nit=$2,telefono=$3,email=$4,ciudad=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$6',
        [nombre_empresa, nit, telefono, email, ciudad, existe[0].id]);
    }
    await auditLog({ userId: req.user.id, accion: 'ACTUALIZAR', tabla: 'company_info', registroId: 1, antes, despues: req.body, ip: req.ip });
    res.json({ ok: true, message: 'Datos de empresa actualizados' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
