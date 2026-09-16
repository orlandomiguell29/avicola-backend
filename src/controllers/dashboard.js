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
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const [anio, mes] = fecha.split('-').map(Number);

    // 1. Cargar agregaciones por día directamente desde la BD (3 consultas en total)
    const [cashRows, provRows, nomRows] = await Promise.all([
      query(`
        SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS f, tipo, SUM(monto_total) AS total 
        FROM cash_movements 
        WHERE deleted_at IS NULL 
        GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d'), tipo
      `),
      query(`
        SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS f, SUM(costo_total) AS total 
        FROM supplier_invoices 
        WHERE deleted_at IS NULL 
        GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d')
      `),
      query(`
        SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS f, SUM(total_pagado) AS total 
        FROM payroll_entries 
        WHERE deleted_at IS NULL 
        GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d')
      `)
    ]);

    // 2. Consolidar datos en un mapa agrupado por fecha
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

    // 3. Obtener el universo de fechas ordenado
    const todasFechas = Array.from(dailyMap.keys()).sort();

    // 4. Métricas de hoy
    const hoyData = dailyMap.get(fecha) || { ing: 0, egCaja: 0, egProv: 0, egNom: 0 };
    const ingDia = hoyData.ing;
    const egCajaDia = hoyData.egCaja;
    const egProvDia = hoyData.egProv;
    const egNomDia = hoyData.egNom;

    // 5. Métricas del mes seleccionado
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

    // 6. Serie de los últimos 7 días con movimiento
    const ultimasFechas = todasFechas.slice(-7);
    const serie = ultimasFechas.map(f => {
      const d = dailyMap.get(f);
      return {
        fecha: f,
        ingresos: d.ing,
        egresos: d.egCaja + d.egProv + d.egNom
      };
    });

    // 7. Serie acumulada histórica
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
