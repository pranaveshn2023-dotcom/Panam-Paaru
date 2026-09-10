// Generates realistic fixture files for testing the investment parser.
// Run:  node parser-tests/gen-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

// ────────────────────────────────────────────────
// Minimal PDF writer (enough for pdf.js text extraction)
// ────────────────────────────────────────────────
function esc(t) {
  return t.replace(/([()\\])/g, '\\$1');
}

/** lines: array of { y: number, cells: [{ x: number, t: string }] } */
function contentStream(lines) {
  let s = '';
  for (const line of lines) {
    for (const c of line.cells) {
      s += `BT /F1 9 Tf 1 0 0 1 ${c.x} ${line.y} Tm (${esc(c.t)}) Tj ET\n`;
    }
  }
  return s;
}

function makePdf(pages) {
  const objects = [];
  const kids = [];
  const nPages = pages.length;
  pages.forEach((content, i) => {
    const pageObjNum = 3 + i * 2;
    kids.push(`${pageObjNum} 0 R`);
    objects[pageObjNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageObjNum + 1} 0 R ` +
      `/Resources << /Font << /F1 ${3 + nPages * 2} 0 R >> >> >>`;
    objects[pageObjNum + 1] = { stream: contentStream(content) };
  });
  const fontObjNum = 3 + nPages * 2;
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${nPages} >>`;
  objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    const obj = objects[i];
    if (obj === undefined) continue;
    offsets[i] = pdf.length;
    if (typeof obj === 'object' && obj.stream) {
      pdf += `${i} 0 obj\n<< /Length ${Buffer.byteLength(obj.stream, 'latin1')} >>\nstream\n${obj.stream}\nendstream\nendobj\n`;
    } else {
      pdf += `${i} 0 obj\n${obj}\nendobj\n`;
    }
  }
  const xrefPos = pdf.length;
  const size = objects.length;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) {
    pdf += String(offsets[i] ?? 0).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// Helper: turn an array of rows into page lines top-down.
function pageLines(rows, startY = 750, step = 14) {
  return rows.map((r, idx) => {
    const cells = Array.isArray(r)
      ? r.map((cell, ci) => (typeof cell === 'object' && cell !== null && 't' in cell ? cell : { x: 40 + ci * 100, t: String(cell) }))
      : r;
    return { y: startY - idx * step, cells };
  });
}

// ────────────────────────────────────────────────
// Fixture 1: CAMS-style CAS PDF (folio → scheme → values on one line)
// ────────────────────────────────────────────────
const camsPage1 = pageLines([
  [{ x: 40, t: 'Consolidated Account Statement' }, { x: 400, t: 'Page 1 of 3' }],
  [{ x: 40, t: 'Statement Period: 01-Apr-2025 to 31-Mar-2026' }],
  [{ x: 40, t: 'PAN: ABCDE1234F' }, { x: 300, t: 'Mobile: 9876543210' }],
  [{ x: 40, t: 'Email: user@example.com' }],
  [],
  [{ x: 40, t: 'Folio No: 1234567890 / 0' }],
  [{ x: 55, t: 'Axis Bluechip Fund - Direct Plan - Growth' }],
  [{ x: 55, t: 'Registrar: CAMS' }, { x: 300, t: 'Advisor: TEST ADVISOR' }],
  [{ x: 55, t: 'Opening Unit Balance: 0.000' }],
  [{ x: 55, t: '01-Jan-2025' }, { x: 130, t: 'Purchase' }, { x: 260, t: '500.000' }, { x: 360, t: '45.0000' }, { x: 480, t: '22500.00' }],
  [{ x: 55, t: '01-Feb-2025' }, { x: 130, t: 'Purchase' }, { x: 260, t: '500.000' }, { x: 360, t: '44.0000' }, { x: 480, t: '22000.00' }],
  [{ x: 55, t: 'Closing Unit Balance: 1000.000' }],
  [{ x: 55, t: 'NAV on 31-Mar-2026: 45.6789' }],
  [{ x: 55, t: 'Market Value: 45678.90' }, { x: 300, t: 'Cost Value: 44500.00' }],
  [{ x: 55, t: 'Weight: 12.30%' }],
  [],
  [{ x: 40, t: 'Folio No: 9876543210 / 0' }],
  [{ x: 55, t: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' }],
  [{ x: 55, t: 'Registrar: CAMS' }],
  [{ x: 55, t: 'Opening Unit Balance: 0.000' }],
  [{ x: 55, t: '01-Mar-2025' }, { x: 130, t: 'Purchase' }, { x: 260, t: '100.000' }, { x: 360, t: '70.0000' }, { x: 480, t: '7000.00' }],
  [{ x: 55, t: 'Closing Unit Balance: 100.000' }],
  [{ x: 55, t: 'NAV on 31-Mar-2026: 80.1234' }],
  [{ x: 55, t: 'Market Value: 8012.34' }, { x: 300, t: 'Cost Value: 7000.00' }],
  [{ x: 55, t: 'Weight: 2.20%' }],
]);

// ────────────────────────────────────────────────
// Fixture 2: KFintech-style CAS PDF ("Name of the Scheme:" + "Total Cost Value")
// ────────────────────────────────────────────────
const kfinPage1 = pageLines([
  [{ x: 40, t: 'Consolidated Account Statement' }],
  [{ x: 40, t: 'Statement Period: 01-Jan-2026 to 31-Mar-2026' }],
  [{ x: 40, t: 'Name of Investor: JOHN DOE' }],
  [{ x: 40, t: 'Mobile: 9876543210' }],
  [],
  [{ x: 40, t: 'Folio No: 7777777777 / 0' }],
  [{ x: 55, t: 'Name of the Scheme: Kotak Flexicap Fund - Direct - Growth' }],
  [{ x: 55, t: 'Registrar : KFin Technologies Private Limited' }],
  [{ x: 55, t: 'Opening Balance: 100.000' }],
  [{ x: 55, t: '01-Jan-2026' }, { x: 130, t: 'Purchase' }, { x: 260, t: '100.000' }, { x: 360, t: '50.00' }, { x: 480, t: '5000.00' }],
  [{ x: 55, t: '05-Feb-2026' }, { x: 130, t: 'Purchase' }, { x: 260, t: '100.000' }, { x: 360, t: '50.00' }, { x: 480, t: '5000.00' }],
  [{ x: 55, t: 'Closing Balance: 200.000' }],
  [{ x: 55, t: 'NAV: 55.6700' }],
  [{ x: 55, t: 'Market Value: 11134.00' }],
  [{ x: 55, t: 'Total Cost Value: 10000.00' }],
  [],
  [{ x: 40, t: 'Folio No: 8888888888 / 0' }],
  [{ x: 55, t: 'Name of the Scheme: Nippon India Small Cap Fund - Direct Plan - Growth' }],
  [{ x: 55, t: 'Registrar : KFin Technologies Private Limited' }],
  [{ x: 55, t: 'Closing Balance: 1500.000' }],
  [{ x: 55, t: 'NAV: 120.5000' }],
  [{ x: 55, t: 'Market Value: 180750.00' }],
  [{ x: 55, t: 'Total Cost Value: 150000.00' }],
]);


// ────────────────────────────────────────────────
// Fixture 3: Generic CSV (Name, Invested, Current)
// ────────────────────────────────────────────────
fs.writeFileSync(
  path.join(outDir, 'simple-portfolio.csv'),
  [
    'Name,Invested Amount,Current Value',
    'Bitcoin,50000,62000',
    'Axis Bluechip Fund Direct Growth,100000,118500',
    'Sovereign Gold Bond 2025,30000,34500',
    'NPS Tier 1 Account,60000,72000',
  ].join('\n')
);

// ────────────────────────────────────────────────
// Fixture 4: Zerodha Console-style CSV
// ────────────────────────────────────────────────
fs.writeFileSync(
  path.join(outDir, 'zerodha-console.csv'),
  [
    'Instrument,Quantity,Average Cost,Closing Price,Current Value,P&L',
    'RELIANCE,10,2500,2890.50,28905,3905',
    'TCS,5,3500,4120.75,20603.75,3103.75',
    'HDFCBANK,20,1500,1710.25,34205,4205',
  ].join('\n')
);

// ────────────────────────────────────────────────
// Fixture 5: Groww-style Excel with title rows and "Units Invested" column
// ────────────────────────────────────────────────
const growwRows = [
  ['Groww Portfolio Report'],
  [],
  ['Scheme Name', 'Units Invested', 'Average Cost (INR)', 'Current Value (INR)', 'Invested Amount (INR)'],
  ['Parag Parikh Flexi Cap Fund Direct Growth', 100.5, 50, 8023.45, 5025],
  ['HDFC Index Fund Nifty 50 Direct Growth', 250, 180, 47500, 45000],
  ['Quant Small Cap Fund Direct Growth', 500, 120, 58000, 60000],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(growwRows), 'Portfolio');
XLSX.writeFile(wb, path.join(outDir, 'groww-portfolio.xlsx'));

// ────────────────────────────────────────────────
// Fixture 6: Header-less CSV (positional fallback)
// ────────────────────────────────────────────────
fs.writeFileSync(
  path.join(outDir, 'manual-no-header.csv'),
  [
    'My Investments List',
    'Gold ETF,12500,14000',
    'Sovereign Gold Bond,50000,55000',
  ].join('\n')
);

// ────────────────────────────────────────────────
// Fixture 7: Manual CSV with title row containing the word "Particulars"
// ────────────────────────────────────────────────
fs.writeFileSync(
  path.join(outDir, 'title-row-report.csv'),
  [
    'Particulars of my holdings as on 31-Mar-2026',
    '',
    'Instrument,Qty,Avg Cost,Current Value',
    'ITC,100,220,25000',
    'INFY,50,800,44000',
  ].join('\n')
);

// ────────────────────────────────────────────────
// Fixture 8: User AMC Template with leading rows and 'Invested Valu' / 'Current Valu'
// ────────────────────────────────────────────────
const amcRows = [];
for (let i = 0; i < 20; i++) {
  amcRows.push(['', '', '', '', '', '', '', '', '', '']);
}
amcRows.push(['AMC', 'Category', 'Sub-category', 'Folio No.', 'Source', 'Units', 'Invested Valu', 'Current Valu', 'Returns', 'XIRR']);
amcRows.push(['HDFC Mutual Fund', 'Equity', 'Mid Cap', '39031078', 'Groww', 14.827, 3349.93, 3443.85, 93.923342, '17.3%']);
amcRows.push(['Axis Mutual Fund', 'Hybrid', 'Dynamic Asset Allocation', '910231017414', 'Groww', 61.826, 1502.99, 1485.06, -17.92954, '-6.15%']);
amcRows.push(['Axis Mutual Fund', 'Debt', 'Liquid', '910231017414', 'Groww', 0.001, 3.11, 3.16, 0.0481728, '9.1%']);
amcRows.push(['Nippon India Mutual Fund', 'Equity', 'Large Cap', '488455735887', 'Groww', 246.21, 10999.46, 10659.49, -339.9695269, '-6.77%']);
amcRows.push(['Edelweiss Mutual Fund', 'Equity', 'International', '91046739273', 'Groww', 56.62, 1599.93, 1788, 188.0722034, '32.69%']);
amcRows.push(['ICICI Prudential Mutual Fund', 'Equity', 'Large Cap', '43192064', 'Groww', 83.7, 5399.71, 5676.4, 276.6852849, '15.8%']);
amcRows.push(['PPFAS Mutual Fund', 'Equity', 'Flexi Cap', '19284417', 'Groww', 175.777, 15999.18, 15713.51, -285.6654316, '-4.05%']);
amcRows.push(['Bandhan Mutual Fund', 'Equity', 'Small Cap', '8956729', 'Groww', 5.614, 300, 324.79, 24.78581, '26.81%']);

const amcWs = XLSX.utils.aoa_to_sheet(amcRows);
const amcWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(amcWb, amcWs, 'Holdings');
XLSX.writeFile(amcWb, path.join(outDir, 'user-amc-template.xlsx'));

console.log('Fixtures written to', outDir);

fs.writeFileSync(path.join(outDir, 'kfin-cas.pdf'), makePdf([kfinPage1]));


fs.writeFileSync(path.join(outDir, 'cams-cas.pdf'), makePdf([camsPage1]));

