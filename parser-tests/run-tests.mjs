// Runs the investment parser against all fixtures and prints results.
// Build the bundle first (see run.sh / commands in README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { pathToFileURL } from 'node:url';
const { parseInvestmentFile, parsePastedText, extractRawGrid } = await import(
  pathToFileURL(path.join(__dirname, 'parser.bundle.mjs')).href
);

// Simple File shim compatible with the parser (needs .name and .arrayBuffer())
class TestFile {
  constructor(buf, name) {
    this._buf = buf;
    this.name = name;
  }
  arrayBuffer() {
    const ab = this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength);
    return Promise.resolve(ab);
  }
}

const fixturesDir = path.join(__dirname, 'fixtures');
const files = fs.readdirSync(fixturesDir).filter((f) => !f.startsWith('.'));

let failures = 0;
const expectations = {
  'cams-cas.pdf': (h) => {
    const axis = h.find((x) => x.name.includes('Axis Bluechip'));
    const pp = h.find((x) => x.name.includes('Parag Parikh'));
    return (
      h.length === 2 &&
      Boolean(axis) &&
      Math.abs(axis.currentValue - 45678.9) < 1 &&
      Math.abs(axis.investedAmount - 44500) < 1 &&
      Math.abs(axis.buyPrice - 44.5) < 0.01 &&
      Math.abs(axis.currentPrice - 45.68) < 0.01 &&
      axis.isin === 'INF200K01QV8' &&
      axis.folioNo === '1234567890 / 0' &&
      (axis.notes || '').includes('ISIN: INF200K01QV8') &&
      (axis.notes || '').includes('Folio: 1234567890 / 0') &&
      Boolean(pp) &&
      pp.isin === 'INF109K016L0' &&
      Math.abs(pp.buyPrice - 70) < 0.01
    );
  },
  'kfin-cas.pdf': (h) => {
    const kotak = h.find((x) => x.name.includes('Kotak Flexicap'));
    const nippon = h.find((x) => x.name.includes('Nippon India Small Cap'));
    return (
      h.length === 2 &&
      Boolean(kotak) &&
      Math.abs(kotak.investedAmount - 10000) < 1 &&
      Math.abs(kotak.currentValue - 11134) < 1 &&
      Math.abs(kotak.currentPrice - 55.67) < 0.01 &&
      Math.abs(kotak.buyPrice - 50) < 0.01 &&
      Boolean(nippon) &&
      Math.abs(nippon.investedAmount - 150000) < 1 &&
      Math.abs(nippon.currentValue - 180750) < 1 &&
      Math.abs(nippon.currentPrice - 120.5) < 0.01 &&
      Math.abs(nippon.buyPrice - 100) < 0.01
    );
  },
  'simple-portfolio.csv': (h) =>
    h.length === 4 &&
    Math.abs(h.find((x) => x.name.includes('Bitcoin'))?.currentValue - 62000) < 1,
  'zerodha-console.csv': (h) =>
    h.length === 3 &&
    h.every((x) => x.units > 0) &&
    Math.abs(h.find((x) => x.name.includes('RELIANCE'))?.investedAmount - 25000) < 1,
  'groww-portfolio.xlsx': (h) => {
    const pp = h.find((x) => x.name.includes('Parag Parikh'));
    return (
      h.length === 3 &&
      Boolean(pp) &&
      Math.abs(pp.investedAmount - 5025) < 1 &&
      Math.abs(pp.units - 100.5) < 0.01 &&
      pp.isin === 'INF332K01RS0' &&
      (pp.notes || '').includes('ISIN: INF332K01RS0')
    );
  },
  'manual-no-header.csv': (h) =>
    h.length === 2 &&
    Math.abs(h[0].investedAmount - 12500) < 1,
  'title-row-report.csv': (h) =>
    h.length === 2 &&
    Math.abs(h.find((x) => x.name.includes('ITC'))?.currentValue - 25000) < 1,
  'returns-pct.csv': (h) => {
    const hdfc = h.find((x) => x.name.includes('HDFC Flexi Cap'));
    const axis = h.find((x) => x.name.includes('Axis Midcap'));
    return (
      h.length === 2 &&
      Boolean(hdfc) &&
      Math.abs(hdfc.currentValue - 11250) < 0.01 &&
      Math.abs(hdfc.returns - 1250) < 0.05 &&
      Boolean(axis) &&
      Math.abs(axis.currentValue - 21600) < 0.01 &&
      Math.abs(axis.returns - 1600) < 0.05
    );
  },
  'combined-folio-isin.csv': (h) =>
    h.length === 1 &&
    h[0].isin === 'INF200K01QV8' &&
    h[0].folioNo === '123456' &&
    (h[0].notes || '').includes('ISIN: INF200K01QV8') &&
    Math.abs(h[0].investedAmount - 10000) < 0.01 &&
    Math.abs(h[0].units - 100) < 0.01,
  'user-amc-template.xlsx': (h) => {
    const hdfc = h.find((x) => x.name.includes('HDFC') && x.name.includes('Mid Cap'));
    const axisDyn = h.find((x) => x.name.includes('Axis') && x.subType.includes('Dynamic'));
    const axisLiq = h.find((x) => x.name.includes('Axis') && x.subType.includes('Liquid'));
    const bandhan = h.find((x) => x.name.includes('Bandhan'));
    const totalInv = h.reduce((s, x) => s + x.investedAmount, 0);
    const totalCur = h.reduce((s, x) => s + x.currentValue, 0);

    return (
      h.length === 8 &&
      Boolean(hdfc) &&
      Math.abs(hdfc.investedAmount - 3349.93) < 0.01 &&
      Math.abs(hdfc.currentValue - 3443.85) < 0.01 &&
      Math.abs(hdfc.units - 14.827) < 0.001 &&
      hdfc.assetType === 'mutual_fund' &&
      hdfc.xirr === '17.3%' &&
      Math.abs(hdfc.returns - 93.92) < 0.05 &&
      Boolean(axisDyn) &&
      Math.abs(axisDyn.investedAmount - 1502.99) < 0.01 &&
      axisDyn.assetType === 'mutual_fund' &&
      axisDyn.xirr === '-6.15%' &&
      Math.abs(axisDyn.returns - (-17.93)) < 0.05 &&
      Boolean(axisLiq) &&
      Math.abs(axisLiq.investedAmount - 3.11) < 0.01 &&
      Math.abs(axisLiq.units - 0.001) < 0.0001 &&
      axisLiq.assetType === 'mutual_fund' &&
      axisLiq.xirr === '9.1%' &&
      Boolean(bandhan) &&
      Math.abs(bandhan.investedAmount - 300) < 0.01 &&
      Math.abs(bandhan.currentValue - 324.79) < 0.01 &&
      bandhan.xirr === '26.81%' &&
      Math.abs(bandhan.returns - 24.79) < 0.05 &&
      Math.abs(totalInv - 39154.31) < 0.1 &&
      Math.abs(totalCur - 39094.26) < 0.1
    );
  },
};

for (const f of files.sort()) {
  const buf = fs.readFileSync(path.join(fixturesDir, f));
  const file = new TestFile(buf, f);
  try {
    const { holdings } = await parseInvestmentFile(file);
    const check = expectations[f];
    const ok = check ? check(holdings) : holdings.length > 0;
    console.log(`\n=== ${f} → ${holdings.length} holdings — ${ok ? 'PASS' : 'FAIL'} ===`);
    for (const h of holdings) {
      console.log(
        `  • ${h.name} | type=${h.assetType} | inv=${h.investedAmount} | cur=${h.currentValue}` +
          (h.units ? ` | units=${h.units}` : '') +
          (h.currentPrice ? ` | nav=${h.currentPrice}` : '') +
          (h.xirr ? ` | xirr=${h.xirr}` : '')
      );
    }
    if (!ok) failures++;
  } catch (err) {
    console.log(`\n=== ${f} → ERROR: ${err.message} ===`);
    failures++;
  }
}

// Paste parser sanity check
const pasted = parsePastedText(
  'Fund Name\tInvested\tCurrent\nFund A\t10000\t12000\nFund B\t5000\t4500\n'
);
const pasteOk = pasted.length === 2 && pasted[0].currentValue === 12000;
console.log(`\n=== pasted-text → ${pasted.length} holdings — ${pasteOk ? 'PASS' : 'FAIL'} ===`);
if (!pasteOk) failures++;

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
