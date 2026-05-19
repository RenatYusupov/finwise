// Анализ рекуррентных платежей через тот же парсер, что в bankImport.ts
// Запуск: node analyze_recurring.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsx = require('/Users/yusupovrenat/Desktop/finwise/node_modules_tmp/node_modules/xlsx/xlsx.js');

const XLSX_PATH = '/Users/yusupovrenat/Downloads/Выписка_2025_11_05T21:03:42_120+0300_2026_05_05T21:03:42_120+0300 (1).xlsx';

// ── Exact copy of parseAmount from bankImport.ts ──────────────────────────────
function parseAmount(raw) {
  if (raw == null) return 0;
  const s = String(raw)
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  return parseFloat(s) || 0;
}

// ── Read XLSX ─────────────────────────────────────────────────────────────────
const wb = xlsx.readFile(XLSX_PATH, { cellDates: false, raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const allRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

// ── Find header row (exact copy of bankImport.ts logic) ───────────────────────
let headerRow = -1, dateCol = -1, descCol = -1, amountCol = -1, categoryCol = -1, statusCol = -1;
for (let i = 0; i < Math.min(30, allRows.length); i++) {
  const row = allRows[i];
  if (!row) continue;
  for (let j = 0; j < row.length; j++) {
    const cell = String(row[j] ?? '').toLowerCase().trim();
    if (cell.includes('дата операции') || cell === 'дата') { headerRow = i; dateCol = j; }
    if (cell.includes('описание') || cell.includes('назначение')) descCol = j;
    if (cell.includes('сумма')) amountCol = j;
    if (cell.includes('категория')) categoryCol = j;
    if (cell.includes('статус')) statusCol = j;
  }
  if (headerRow >= 0) break;
}
if (descCol < 0) descCol = 11;
if (amountCol < 0) amountCol = 12;
if (categoryCol < 0) categoryCol = 4;

console.log(`Header row: ${headerRow} | dateCol: ${dateCol} | descCol: ${descCol} | amountCol: ${amountCol} | statusCol: ${statusCol}`);
console.log(`Total raw rows: ${allRows.length}`);
console.log('');

// ── Parse ALL rows WITHOUT any filter — show raw picture ──────────────────────
const allParsed = [];
for (let i = headerRow + 1; i < allRows.length; i++) {
  const row = allRows[i];
  if (!row || row.length === 0) continue;
  const dateRaw = String(row[dateCol] ?? '');
  const descRaw = String(row[descCol] ?? '');
  const amountRaw = row[amountCol];
  const catRaw   = String(row[categoryCol] ?? '');
  const statusRaw = statusCol >= 0 ? String(row[statusCol] ?? '') : '';
  if (!dateRaw.match(/^\d{2}\.\d{2}\.\d{4}/)) continue;
  const amount = parseAmount(amountRaw);
  if (amount === 0) continue;
  allParsed.push({ date: dateRaw, amount, abs: Math.abs(amount), desc: descRaw, cat: catRaw, status: statusRaw });
}

console.log(`All parsed rows (no filter): ${allParsed.length}`);
console.log('');

// ── SECTION 1: Search 80k–95k range — ALL rows, no filter ────────────────────
console.log('='.repeat(70));
console.log('SECTION 1: ALL ROWS 80,000–95,000 ₽ OUTFLOWS (no filter at all)');
console.log('='.repeat(70));
const range8090 = allParsed.filter(t => t.amount < 0 && t.abs >= 80000 && t.abs <= 95000);
if (range8090.length === 0) {
  console.log('  *** NONE FOUND in 80k–95k range ***');
} else {
  range8090.sort((a,b) => a.date.localeCompare(b.date)).forEach(t => {
    console.log(`  ${t.date}  ${t.abs.toLocaleString('ru')} ₽  status=${JSON.stringify(t.status)}`);
    console.log(`    [${t.cat}] ${t.desc.substring(0, 100)}`);
  });
}
console.log('');

// ── SECTION 2: ALL outflows >= 50k, no filter ────────────────────────────────
console.log('='.repeat(70));
console.log('SECTION 2: ALL OUTFLOWS >= 50,000 ₽ (no filter, sorted by date)');
console.log('='.repeat(70));
const big50 = allParsed.filter(t => t.amount < 0 && t.abs >= 50000);
big50.sort((a,b) => a.date.localeCompare(b.date)).forEach(t => {
  console.log(`  ${t.date}  ${t.abs.toLocaleString('ru')} ₽  status=${JSON.stringify(t.status)}`);
  console.log(`    [${t.cat}] ${t.desc.substring(0, 100)}`);
});
console.log('');

// ── SECTION 3: What bankImport.ts SKIPS (internal transfers) ─────────────────
console.log('='.repeat(70));
console.log('SECTION 3: ROWS SKIPPED BY bankImport.ts (Внутрибанковский + между счетами)');
console.log('='.repeat(70));
const skippedInternal = allParsed.filter(t => {
  const d = t.desc.toLowerCase();
  return d.includes('внутрибанковский перевод') && d.includes('между счетами');
});
skippedInternal.sort((a,b) => a.date.localeCompare(b.date)).forEach(t => {
  const sign = t.amount < 0 ? '-' : '+';
  console.log(`  ${t.date}  ${sign}${t.abs.toLocaleString('ru')} ₽  status=${JSON.stringify(t.status)}`);
  console.log(`    [${t.cat}] ${t.desc.substring(0, 100)}`);
});
console.log(`  Total skipped internal: ${skippedInternal.length}`);
console.log('');

// ── SECTION 4: Recurring detection on what bankImport PASSES ─────────────────
// Replicate bankImport.ts filter exactly
const passed = [];
for (const t of allParsed) {
  if (t.status.toLowerCase().includes('отклон')) continue;
  const d = t.desc.toLowerCase();
  if (d.includes('внутрибанковский перевод') && d.includes('между счетами')) continue;
  passed.push(t);
}
console.log(`Transactions that PASS bankImport filter: ${passed.length}`);
console.log('');

// Group expenses by month
const expenses = passed.filter(t => t.amount < 0);
const byMonth = {};
for (const t of expenses) {
  const parts = t.date.split('.');
  const month = `${parts[2]}-${parts[1]}`; // YYYY-MM
  const day = parseInt(parts[0]);
  if (!byMonth[month]) byMonth[month] = [];
  byMonth[month].push({ ...t, day });
}

const months = Object.keys(byMonth).sort();
console.log(`Expense months: ${months.join(', ')}`);
console.log('');

// ── SECTION 5: Recurring pattern detection (amount ±15%, day ±7, ≥2 months) ──
console.log('='.repeat(70));
console.log('SECTION 5: RECURRING PATTERNS (amount ±15%, day ±7d, ≥2 months, ≥5,000 ₽)');
console.log('='.repeat(70));

// Collect all expense transactions with month/day
const allExpTxs = [];
for (const [month, txs] of Object.entries(byMonth)) {
  for (const t of txs) {
    allExpTxs.push({ ...t, month });
  }
}

// For each transaction, find similar ones in other months
const matched = new Set();
const patterns = [];

for (let i = 0; i < allExpTxs.length; i++) {
  if (matched.has(i)) continue;
  const anchor = allExpTxs[i];
  if (anchor.abs < 5000) continue;

  const group = [{ idx: i, tx: anchor }];
  for (let j = i + 1; j < allExpTxs.length; j++) {
    if (matched.has(j)) continue;
    const cand = allExpTxs[j];
    if (cand.month === anchor.month) continue; // same month
    const amtDiff = Math.abs(cand.abs - anchor.abs) / anchor.abs;
    const dayDiff = Math.abs(cand.day - anchor.day);
    if (amtDiff <= 0.15 && dayDiff <= 7) {
      group.push({ idx: j, tx: cand });
    }
  }

  if (group.length >= 2) {
    // Check distinct months
    const distinctMonths = new Set(group.map(g => g.tx.month));
    if (distinctMonths.size >= 2) {
      group.forEach(g => matched.add(g.idx));
      const amounts = group.map(g => g.tx.abs).sort((a,b) => a-b);
      const days = group.map(g => g.tx.day);
      const medAmt = amounts[Math.floor(amounts.length / 2)];
      const dayMean = days.reduce((s,d) => s+d, 0) / days.length;
      const dayStd = Math.sqrt(days.map(d => (d-dayMean)**2).reduce((s,v) => s+v, 0) / days.length);
      patterns.push({
        medAmt, dayMean, dayStd,
        months: [...distinctMonths].sort(),
        txs: group.map(g => g.tx),
      });
    }
  }
}

patterns.sort((a,b) => b.medAmt - a.medAmt);
for (const p of patterns) {
  console.log(`\n  ~${p.medAmt.toLocaleString('ru')} ₽  →  ${p.months.length} months: [${p.months.join(', ')}]`);
  console.log(`  Day: mean=${p.dayMean.toFixed(1)}, std=${p.dayStd.toFixed(1)}`);
  for (const t of p.txs) {
    console.log(`    ${t.date}  day=${t.day}  ${t.abs.toLocaleString('ru')} ₽  status=${JSON.stringify(t.status)}`);
    console.log(`      [${t.cat}] ${t.desc.substring(0, 80)}`);
  }
}
if (patterns.length === 0) console.log('  No recurring patterns found.');
