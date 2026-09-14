import { query } from '../db.js';

async function v(sql, params = []) {
  const rows = await query(sql, params);
  return Number(rows[0]?.v || 0);
}

function toStr(d) {
  if (!d) return null;
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return String(d).substring(0, 10);
}

export async function getDashboard(req, res) {
  try {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const [anio, mes] = fecha.split('-').map(Number);

    const ingDia    = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='DEBE' AND deleted_at IS NULL", [fecha]);
    const egCajaDia = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='HABER' AND deleted_at IS NULL", [fecha]);
    const egProvDia = await v("SELECT COALESCE(SUM(costo_total),0) v FROM supplier_invoices WHERE fecha=? AND deleted_at IS NULL", [fecha]);
    const egNomDia  = await v("SELECT COALESCE(SUM(total_pagado),0) v FROM payroll_entries WHERE fecha=? AND deleted_at IS NULL", [fecha]);

    // YEAR()/MONTH() evita el error de colación de DATE_FORMAT
    const ingMes    = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE YEAR(fecha)=? AND MONTH(fecha)=? AND tipo='DEBE' AND deleted_at IS NULL", [anio, mes]);
    const egCajaMes = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE YEAR(fecha)=? AND MONTH(fecha)=? AND tipo='HABER' AND deleted_at IS NULL", [anio, mes]);
    const egProvMes = await v("SELECT COALESCE(SUM(costo_total),0) v FROM supplier_invoices WHERE YEAR(fecha)=? AND MONTH(fecha)=? AND deleted_at IS NULL", [anio, mes]);
    const egNomMes  = await v("SELECT COALESCE(SUM(total_pagado),0) v FROM payroll_entries WHERE YEAR(fecha)=? AND MONTH(fecha)=? AND deleted_at IS NULL", [anio, mes]);

    // Fechas únicas — consultas separadas para evitar UNION con error de colación
    const fc = await query("SELECT DISTINCT fecha f FROM cash_movements WHERE deleted_at IS NULL ORDER BY fecha");
    const ff = await query("SELECT DISTINCT fecha f FROM supplier_invoices WHERE deleted_at IS NULL ORDER BY fecha");
    const fn = await query("SELECT DISTINCT fecha f FROM payroll_entries WHERE deleted_at IS NULL ORDER BY fecha");
    const todasFechas = [...new Set([...fc, ...ff, ...fn].map(r => toStr(r.f)).filter(Boolean))].sort();

    const serie = [];
    for (const f of todasFechas.slice(-7)) {
      const i  = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='DEBE' AND deleted_at IS NULL", [f]);
      const ec = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='HABER' AND deleted_at IS NULL", [f]);
      const ep = await v("SELECT COALESCE(SUM(costo_total),0) v FROM supplier_invoices WHERE fecha=? AND deleted_at IS NULL", [f]);
      const en = await v("SELECT COALESCE(SUM(total_pagado),0) v FROM payroll_entries WHERE fecha=? AND deleted_at IS NULL", [f]);
      serie.push({ fecha: f, ingresos: i, egresos: ec + ep + en });
    }

    let acumI = 0, acumE = 0;
    const serieAcum = [];
    for (const f of todasFechas) {
      const i  = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='DEBE' AND deleted_at IS NULL", [f]);
      const ec = await v("SELECT COALESCE(SUM(monto_total),0) v FROM cash_movements WHERE fecha=? AND tipo='HABER' AND deleted_at IS NULL", [f]);
      const ep = await v("SELECT COALESCE(SUM(costo_total),0) v FROM supplier_invoices WHERE fecha=? AND deleted_at IS NULL", [f]);
      const en = await v("SELECT COALESCE(SUM(total_pagado),0) v FROM payroll_entries WHERE fecha=? AND deleted_at IS NULL", [f]);
      acumI += i; acumE += ec + ep + en;
      serieAcum.push({ fecha: f, ingresos: acumI, egresos: acumE, utilidad: acumI - acumE });
    }

    const egD = egCajaDia + egProvDia + egNomDia;
    const egM = egCajaMes + egProvMes + egNomMes;
    res.json({
      fecha,
      resumenDia:         { ingresos: ingDia, egresos: egD, neto: ingDia - egD },
      resumenMes:         { ingresos: ingMes, egresos: egM, utilidad: ingMes - egM },
      desgloseEgresosMes: { caja: egCajaMes, proveedores: egProvMes, nomina: egNomMes },
      serie, serieAcum,
    });
  } catch (e) {
    console.error('Dashboard error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
