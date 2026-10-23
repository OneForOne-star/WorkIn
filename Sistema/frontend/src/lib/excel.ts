import type { Line } from './pagos'

export interface ExcelWorker { rut: string; name: string; status?: string; lines: Line[] }

const TZ = 'America/Santiago'
const STATUS: Record<string, string> = { pending: 'Pendiente de envío', sent: 'Enviado', accepted: 'Aceptado', disputed: 'En reclamo' }

/** Hora de pared en Santiago como fecha "UTC", para que Excel muestre la hora local sin conversiones. */
function wall(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  )
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute))
}
const dayOf = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

/**
 * Libro de Excel con fórmulas vivas:
 *  - Parámetros: "Valor turno" y "Valor hora extra" por tarifa.
 *  - Detalle: una fila por turno; el valor sale de Parámetros y el pago de las horas extra es horas × valor.
 *  - Resumen: sumas por trabajador calculadas desde el Detalle.
 */
export async function downloadPaymentsXlsx(opts: { title: string; fileName: string; workers: ExcelWorker[] }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'WorkIn'
  const resumen = wb.addWorksheet('Resumen')
  const detalle = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] })
  const params = wb.addWorksheet('Parámetros', { views: [{ state: 'frozen', ySplit: 1 }] })

  const MONEY = '"$"#,##0', HOURS = '0.00', DT = 'dd-mm-yyyy hh:mm', D = 'dd-mm-yyyy'
  const head = (ws: import('exceljs').Worksheet, row: number) => {
    const r = ws.getRow(row)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }
    r.alignment = { vertical: 'middle', wrapText: true }
    r.height = 30
  }

  // ---------- Parámetros ----------
  const keyOf = new Map<string, string>()
  const taken = new Set<string>()
  const rates: { label: string; shift: number; ot: number }[] = []
  for (const w of opts.workers) for (const l of w.lines) {
    const k = `${l.rate_name ?? ''}|${l.shift_amount}|${l.overtime_rate}`
    if (keyOf.has(k)) continue
    const base = l.rate_name || 'Sin tarifa'
    let label = base, n = 2
    while (taken.has(label)) label = `${base} (${n++})`
    taken.add(label); keyOf.set(k, label)
    rates.push({ label, shift: l.shift_amount, ot: l.overtime_rate })
  }
  params.columns = [{ width: 30 }, { width: 16 }, { width: 20 }, { width: 3 }, { width: 70 }]
  params.addRow(['Tarifa', 'Valor turno', 'Valor hora extra'])
  head(params, 1)
  rates.forEach((r, i) => {
    const row = params.addRow([r.label, r.shift, r.ot])
    row.getCell(2).numFmt = MONEY; row.getCell(3).numFmt = MONEY
    for (const c of [2, 3]) {
      row.getCell(c).font = { color: { argb: 'FF0000FF' } }
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8DC' } }
    }
    void i
  })
  params.getCell('E1').value = 'Los valores en azul son los que se aplicaron a los turnos de este período. Si los cambias, Detalle y Resumen se recalculan solos (útil para simular). Los turnos publicados conservan su tarifa en WorkIn.'
  params.getCell('E1').alignment = { wrapText: true, vertical: 'top' }
  const lastRate = rates.length + 1

  // ---------- Detalle ----------
  detalle.columns = [
    { header: 'RUT', width: 13 }, { header: 'Trabajador', width: 26 }, { header: 'Fecha', width: 12 }, { header: 'Turno', width: 24 },
    { header: 'Lugar', width: 22 }, { header: 'Tarifa', width: 22 }, { header: 'Entrada marcada', width: 17 }, { header: 'Salida marcada', width: 17 },
    { header: 'Horas trabajadas', width: 11 }, { header: 'Valor turno', width: 13 }, { header: 'Horas extra autorizadas', width: 12 },
    { header: 'Valor hora extra', width: 13 }, { header: 'Pago horas extra', width: 14 }, { header: 'Total a pagar', width: 14 }, { header: 'Observaciones', width: 60 },
  ]
  head(detalle, 1)
  let r = 2
  for (const w of opts.workers) for (const l of w.lines) {
    const label = keyOf.get(`${l.rate_name ?? ''}|${l.shift_amount}|${l.overtime_rate}`)!
    const cin = wall(l.check_in_at), cout = wall(l.check_out_at)
    const hrs = l.worked_minutes === null ? '' : Math.round((l.worked_minutes / 60) * 100) / 100
    const notes = [
      l.is_night ? 'Turno nocturno' : '', l.is_holiday ? 'Festivo' : '',
      l.manual ? `Marca manual${l.manual_by ? ` de ${l.manual_by}` : ''}` : '',
      ...l.overtime.map((o) => `Extra ${o.hours} h${o.authorized_by ? ` autorizada por ${o.authorized_by}` : ''}${o.comment ? `: ${o.comment}` : ''}`),
      l.comment ?? '',
    ].filter(Boolean).join(' · ')
    const row = detalle.getRow(r)
    row.getCell(1).value = w.rut
    row.getCell(2).value = w.name
    row.getCell(3).value = dayOf(l.date)
    row.getCell(4).value = l.title
    row.getCell(5).value = l.location
    row.getCell(6).value = label
    if (cin) row.getCell(7).value = cin
    if (cout) row.getCell(8).value = cout
    row.getCell(9).value = { formula: `IF(AND(ISNUMBER(G${r}),ISNUMBER(H${r})),ROUND((H${r}-G${r})*24,2),"")`, result: hrs }
    row.getCell(10).value = { formula: `VLOOKUP(F${r},Parámetros!$A$2:$C$${lastRate},2,FALSE)`, result: l.shift_amount }
    row.getCell(11).value = l.overtime_hours
    row.getCell(12).value = { formula: `VLOOKUP(F${r},Parámetros!$A$2:$C$${lastRate},3,FALSE)`, result: l.overtime_rate }
    row.getCell(13).value = { formula: `ROUND(K${r}*L${r},0)`, result: l.overtime_amount }
    row.getCell(14).value = { formula: `J${r}+M${r}`, result: l.total }
    row.getCell(15).value = notes
    row.getCell(3).numFmt = D; row.getCell(7).numFmt = DT; row.getCell(8).numFmt = DT
    row.getCell(9).numFmt = HOURS; row.getCell(11).numFmt = HOURS
    for (const c of [10, 12, 13, 14]) row.getCell(c).numFmt = MONEY
    row.getCell(11).font = { color: { argb: 'FF0000FF' } }
    row.getCell(14).font = { bold: true }
    r++
  }
  const lastDet = Math.max(r - 1, 2)
  const total = detalle.getRow(r + 1)
  total.getCell(2).value = 'Total'
  for (const [c, col] of [[10, 'J'], [11, 'K'], [13, 'M'], [14, 'N']] as const) {
    total.getCell(c).value = { formula: `SUM(${col}2:${col}${lastDet})`, result: opts.workers.reduce((a, w) => a + w.lines.reduce((b, l) => b + (c === 10 ? l.shift_amount : c === 11 ? l.overtime_hours : c === 13 ? l.overtime_amount : l.total), 0), 0) }
    total.getCell(c).numFmt = c === 11 ? HOURS : MONEY
  }
  total.font = { bold: true }
  detalle.autoFilter = { from: 'A1', to: `O${lastDet}` }

  // ---------- Resumen ----------
  resumen.columns = [{ width: 13 }, { width: 28 }, { width: 20 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 16 }]
  resumen.getCell('A1').value = opts.title
  resumen.getCell('A1').font = { bold: true, size: 14 }
  resumen.getCell('A2').value = 'Cada monto se calcula desde la hoja Detalle; los valores por tarifa están en la hoja Parámetros. Montos brutos.'
  resumen.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } }
  resumen.addRow([])
  resumen.addRow(['RUT', 'Trabajador', 'Estado', 'Turnos', 'Pago por turnos', 'Horas extra', 'Pago horas extra', 'Total a pagar'])
  head(resumen, 4)
  const rng = (col: string) => `Detalle!$${col}$2:$${col}$${lastDet}`
  let rr = 5
  for (const w of opts.workers) {
    const ts = w.lines.length, sh = w.lines.reduce((a, l) => a + l.shift_amount, 0)
    const oh = Math.round(w.lines.reduce((a, l) => a + l.overtime_hours, 0) * 100) / 100
    const oa = w.lines.reduce((a, l) => a + l.overtime_amount, 0)
    const row = resumen.getRow(rr)
    row.getCell(1).value = w.rut
    row.getCell(2).value = w.name
    row.getCell(3).value = w.status ? STATUS[w.status] ?? w.status : 'Sin cerrar'
    row.getCell(4).value = { formula: `COUNTIFS(${rng('A')},A${rr})`, result: ts }
    row.getCell(5).value = { formula: `SUMIFS(${rng('J')},${rng('A')},A${rr})`, result: sh }
    row.getCell(6).value = { formula: `SUMIFS(${rng('K')},${rng('A')},A${rr})`, result: oh }
    row.getCell(7).value = { formula: `SUMIFS(${rng('M')},${rng('A')},A${rr})`, result: oa }
    row.getCell(8).value = { formula: `E${rr}+G${rr}`, result: sh + oa }
    row.getCell(5).numFmt = MONEY; row.getCell(7).numFmt = MONEY; row.getCell(8).numFmt = MONEY; row.getCell(6).numFmt = HOURS
    row.getCell(8).font = { bold: true }
    rr++
  }
  const t = resumen.getRow(rr)
  t.getCell(2).value = 'Total'
  const sums: [number, string, number][] = [
    [4, 'D', opts.workers.reduce((a, w) => a + w.lines.length, 0)],
    [5, 'E', opts.workers.reduce((a, w) => a + w.lines.reduce((b, l) => b + l.shift_amount, 0), 0)],
    [6, 'F', opts.workers.reduce((a, w) => a + w.lines.reduce((b, l) => b + l.overtime_hours, 0), 0)],
    [7, 'G', opts.workers.reduce((a, w) => a + w.lines.reduce((b, l) => b + l.overtime_amount, 0), 0)],
    [8, 'H', opts.workers.reduce((a, w) => a + w.lines.reduce((b, l) => b + l.total, 0), 0)],
  ]
  for (const [c, col, res] of sums) {
    t.getCell(c).value = { formula: `SUM(${col}5:${col}${Math.max(rr - 1, 5)})`, result: res }
    t.getCell(c).numFmt = c === 4 ? '0' : c === 6 ? HOURS : MONEY
  }
  t.font = { bold: true }
  t.border = { top: { style: 'thin' } }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = opts.fileName
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
