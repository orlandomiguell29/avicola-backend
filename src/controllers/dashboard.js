import { query } from '../db.js';

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
    // 1. Obtener todas las agrupaciones formateando la fecha de forma nativa en PG (YYYY-MM-DD)
    const [cashRows, provRows, nomRows] = await Promise.all([
      query(`
        SELECT fecha::date::text AS f, tipo, SUM(monto_total) AS total 
        FROM cash_movements 
        WHERE deleted_at IS NULL 
        GROUP BY fecha::date::text, tipo
      `),
      query(`
        SELECT fecha::date::text AS f, SUM(costo_total) AS total 
        FROM supplier_invoices 
        WHERE deleted_at IS NULL 
        GROUP BY fecha::date::text
      `),
      query(`
        SELECT fecha::date::text AS f, SUM(total_pagado) AS total 
        FROM payroll_entries 
        WHERE deleted_at IS NULL 
        GROUP BY fecha::date::text
      `)
    ]);

    const dailyMap = new Map();

    const getOrCreate = (f) => {
      if (!dailyMap.has(f)) {
        dailyMap.set(f, { ing: 0, egCaja: 0, egProv: 0, egNom: 0 });
      }
      return dailyMap.get(f);
    };

    for (const r of cashRows) {
      const f = toStr(r.f);
      if (!f) continue;
      const entry = getOrCreate(f);
      if (r.tipo === 'DEBE') entry.ing += Number(r.total || 0);
      else if (r.tipo === 'HABER') entry.egCaja += Number(r.total || 0);
    }

    for (const r of provRows) {
      const f = toStr(r.f);
      if (!f) continue;
      getOrCreate(f).egProv += Number(r.total || 0);
    }

    for (const r of nomRows) {
      const f = toStr(r.f);
      if (!f) continue;
      getOrCreate(f).egNom += Number(r.total || 0);
    }

    const todasFechas = Array.from(dailyMap.keys()).sort();

    // 2. Determinar la fecha de consulta: si no se envía o no hay datos para esa fecha, usa la última fecha con movimientos
    let fecha = req.query.fecha;
    if (!fecha || !dailyMap.has(fecha)) {
      fecha = todasFechas.length > 0 ? todasFechas[todasFechas.length - 1] : new Date().toISOString().split('T')[0];
    }

    const [anio, mes] = fecha.split('-').map(Number);

    const hoyData = dailyMap.get(fecha) || { ing: 0, egCaja: 0, egProv: 0, egNom: 0 };
    const ingDia = hoyData.ing;
    const egCajaDia = hoyData.egCaja;
    const egProvDia = hoyData.egProv;
    const egNomDia = hoyData.egNom;

    let ingMes = 0, egCajaMes = 0, egProvMes = 0, egNomMes = 0;
    for (const [f, data] of dailyMap.entries()) {
      const [y, m] = f.split('-').map(Number);
      if (y === anio && m === mes) {
        ingMes += data.ing;
        egCajaMes += data.egCaja;
        egProvMes += data.egProv;
        egNomMes += data.egNom;
      }
    }

    const ultimasFechas = todasFechas.slice(-7);
    const serie = ultimasFechas.map(f => {
      const d = dailyMap.get(f);
      return {
        fecha: f,
        ingresos: d.ing,
        egresos: d.egCaja + d.egProv + d.egNom
      };
    });

    let acumI = 0, acumE = 0;
    const serieAcum = [];
    for (const f of todasFechas) {
      const d = dailyMap.get(f);
      acumI += d.ing;
      acumE += (d.egCaja + d.egProv + d.egNom);
      serieAcum.push({
        fecha: f,
        ingresos: acumI,
        egresos: acumE,
        utilidad: acumI - acumE
      });
    }

    const egD = egCajaDia + egProvDia + egNomDia;
    const egM = egCajaMes + egProvMes + egNomMes;

    res.json({
      fecha,
      resumenDia: { ingresos: ingDia, egresos: egD, neto: ingDia - egD },
      resumenMes: { ingresos: ingMes, egresos: egM, utilidad: ingMes - egM },
      desgloseEgresosMes: { caja: egCajaMes, proveedores: egProvMes, nomina: egNomMes },
      serie,
      serieAcum,
    });
  } catch (e) {
    console.error('Dashboard error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
