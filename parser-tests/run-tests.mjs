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
  'cams-cas.pdf': (h) =>
    h.length === 2 &&
    h[0].name.includes('Axis Bluechip') &&
    Math.abs(h[0].currentValue - 45678.9) < 1 &&
    Math.abs(h[0].investedAmount - 44500) < 1 &&
    h[1].name.includes('Parag Parikh'),
  'kfin-cas.pdf': (h) =>
    h.length === 2 &&
    h[0].name.includes('Kotak Flexicap') &&
    Math.abs(h[0].investedAmount - 10000) < 1 &&
    Math.abs(h[0].currentValue - 11134) < 1 &&
    h[1].name.includes('Nippon India Small Cap') &&
    Math.abs(h[1].investedAmount - 150000) < 1 &&
    Math.abs(h[1].currentValue - 180750) < 1,
  'simple-portfolio.csv': (h) =>
    h.length === 4 &&
    Math.abs(h.find((x) => x.name.includes('Bitcoin'))?.currentValue - 62000) < 1,
  'zerodha-console.csv': (h) =>
    h.length === 3 &&
    h.every((x) => x.units > 0) &&
    Math.abs(h.find((x) => x.name.includes('RELIANCE'))?.investedAmount - 25000) < 1,
  'groww-portfolio.xlsx': (h) =>
    h.length === 3 &&
    Math.abs(h.find((x) => x.name.includes('Parag Parikh'))?.investedAmount - 5025) < 1 &&
    Math.abs(h.find((x) => x.name.includes('Parag Parikh'))?.units - 100.5) < 0.01,
  'manual-no-header.csv': (h) =>
    h.length === 2 &&
    Math.abs(h[0].investedAmount - 12500) < 1,
  'title-row-report.csv': (h) =>
    h.length === 2 &&
    Math.abs(h.find((x) => x.name.includes('ITC'))?.currentValue - 25000) < 1,
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
