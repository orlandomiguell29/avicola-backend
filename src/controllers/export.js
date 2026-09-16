import ExcelJS from 'exceljs';
import { query } from '../db.js';

// Convierte cualquier tipo de fecha (string, Date object) a dd/mm/yyyy
function fmtF(d) {
  if (!d) return '';
  let date;
  if (d instanceof Date) {
    date = d;
  } else if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    date = new Date(d);
  } else {
    date = new Date(d);
  }
  if (isNaN(date.getTime())) return String(d);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function estilo(ws, fila, idx) {
  const color = idx % 2 === 0 ? 'FFEBF3FA' : 'FFFFFFFF';
  fila.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; });
}

function encabezado(ws, cols, numFila) {
  const fila = ws.addRow(cols);
  fila.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center' };
  });
  fila.height = 18;
  return fila;
}

export async function completo(req, res) {
  try {
    const { desde = '', hasta = '' } = req.query;
    let wC = 'deleted_at IS NULL', wF = 'deleted_at IS NULL', wN = 'deleted_at IS NULL';
    const pC = [], pF = [], pN = [];

    if (desde) {
      pC.push(desde); wC += ` AND fecha >= $${pC.length}`;
      pF.push(desde); wF += ` AND fecha >= $${pF.length}`;
      pN.push(desde); wN += ` AND fecha >= $${pN.length}`;
    }
    if (hasta) {
      pC.push(hasta); wC += ` AND fecha <= $${pC.length}`;
      pF.push(hasta); wF += ` AND fecha <= $${pF.length}`;
      pN.push(hasta); wN += ` AND fecha <= $${pN.length}`;
    }

    const [caja, facturas, nomina] = await Promise.all([
      query(`SELECT cm.*,u.name uname FROM cash_movements cm LEFT JOIN users u ON u.id=cm.user_id WHERE cm.${wC} ORDER BY cm.fecha`, pC),
      query(`SELECT si.*,u.name uname FROM supplier_invoices si LEFT JOIN users u ON u.id=si.user_id WHERE si.${wF} ORDER BY si.fecha`, pF),
      query(`SELECT pe.*,u.name uname FROM payroll_entries pe LEFT JOIN users u ON u.id=pe.user_id WHERE pe.${wN} ORDER BY pe.consecutivo`, pN),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Los Flamencos';

    // HOJA 1: Caja
    const ws1 = wb.addWorksheet('Caja');
    ws1.mergeCells('A1:G1');
    ws1.getCell('A1').value = 'AVÍCOLA Y MISCELÁNEA LOS FLAMENCOS — Movimientos de Caja';
    ws1.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
    ws1.getCell('A1').alignment = { horizontal: 'center' };
    ws1.addRow([]);
    encabezado(ws1, ['Fecha', 'Tipo', 'Concepto', 'Cantidad', 'Precio Unitario', 'Monto Total', 'Usuario']);
    caja.forEach((m, i) => {
      const r = ws1.addRow([fmtF(m.fecha), m.tipo, m.concepto, Number(m.cantidad), Number(m.precio_unitario), Number(m.monto_total), m.uname]);
      r.getCell(5).numFmt = '$#,##0'; r.getCell(6).numFmt = '$#,##0';
      estilo(ws1, r, i);
    });
    [16, 8, 35, 10, 18, 18, 20].forEach((w, i) => ws1.getColumn(i + 1).width = w);

    // HOJA 2: Facturas
    const ws2 = wb.addWorksheet('Facturas Proveedores');
    ws2.mergeCells('A1:H1');
    ws2.getCell('A1').value = 'AVÍCOLA Y MISCELÁNEA LOS FLAMENCOS — Facturación de Proveedores';
    ws2.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
    ws2.getCell('A1').alignment = { horizontal: 'center' };
    ws2.addRow([]);
    encabezado(ws2, ['Fecha', 'Proveedor', 'No. Factura', 'Insumo / Descripción', 'Cantidad', 'Costo Unitario', 'Costo Total', 'Usuario']);
    facturas.forEach((f, i) => {
      const r = ws2.addRow([fmtF(f.fecha), f.nombre_proveedor, f.numero_factura, f.descripcion_insumo, Number(f.cantidad), Number(f.costo_unitario), Number(f.costo_total), f.uname]);
      r.getCell(6).numFmt = '$#,##0'; r.getCell(7).numFmt = '$#,##0';
      estilo(ws2, r, i);
    });
    [16, 30, 16, 35, 10, 18, 18, 20].forEach((w, i) => ws2.getColumn(i + 1).width = w);

    // HOJA 3: Nómina
    const ws3 = wb.addWorksheet('Nómina');
    ws3.mergeCells('A1:I1');
    ws3.getCell('A1').value = 'AVÍCOLA Y MISCELÁNEA LOS FLAMENCOS — Historial de Nómina';
    ws3.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
    ws3.getCell('A1').alignment = { horizontal: 'center' };
    ws3.addRow([]);
    encabezado(ws3, ['Consecutivo', 'Fecha', 'Empleado', 'Tipo', 'Base', 'Cantidad', 'Tarifa Aplicada', 'Total Pagado', 'Usuario']);
    nomina.forEach((n, i) => {
      const r = ws3.addRow([String(n.consecutivo).padStart(7, '0'), fmtF(n.fecha), n.nombre_empleado, n.tipo_empleado === 'FIJO' ? 'Fijo' : 'Variable', 'Por ' + n.base_periodo, Number(n.cantidad_trabajada), Number(n.tarifa_aplicada), Number(n.total_pagado), n.uname]);
      r.getCell(7).numFmt = '$#,##0'; r.getCell(8).numFmt = '$#,##0';
      estilo(ws3, r, i);
    });
    [14, 16, 30, 10, 12, 10, 18, 18, 20].forEach((w, i) => ws3.getColumn(i + 1).width = w);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=reporte_flamencos_${new Date().toISOString().split('T')[0]}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('Export error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
