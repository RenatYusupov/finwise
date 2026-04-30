// ─── Smart Category Detection ─────────────────────────────────────────────────

const CATEGORY_RULES: Array<{ keywords: string[]; categoryId: string }> = [
  { keywords: ['пятёрочка', 'пятерочка', 'перекрёсток', 'перекресток', 'магнит', 'лента', 'ашан', 'дикси', 'вкусвилл', 'metro', 'продукты', 'гипермаркет', 'fix price', 'фикс прайс', 'красное белое', 'бристоль', 'азбука вкуса', 'spar', 'окей', 'глобус', 'верный', 'светофор', 'чижик'], categoryId: 'food' },
  { keywords: ['кафе', 'ресторан', 'кофе', 'coffee', 'starbucks', 'макдоналдс', 'бургер', 'kfc', 'пицца', 'pizza', 'суши', 'sushi', 'бар', 'паб', 'столовая', 'шоколадница', 'якитория', 'тануки', 'додо', 'вкусно и точка', 'subway', 'шаурма', 'delivery club', 'яндекс еда', 'самокат'], categoryId: 'cafe' },
  { keywords: ['такси', 'taxi', 'яндекс.такси', 'uber', 'метро', 'автобус', 'электричка', 'ржд', 'поезд', 'бензин', 'азс', 'лукойл', 'газпром', 'роснефть', 'парковка', 'каршеринг', 'яндекс драйв', 'ситидрайв', 'делимобиль', 'мосметро', 'тройка', 'аэроэкспресс'], categoryId: 'transport' },
  { keywords: ['wildberries', 'вайлдберриз', 'ozon', 'озон', 'lamoda', 'ламода', 'aliexpress', 'amazon', 'h&m', 'zara', 'uniqlo', 'adidas', 'nike', 'мвидео', 'м.видео', 'эльдорадо', 'dns', 'ситилинк', 'ikea', 'икеа', 'леруа', 'leroy', 'obi', 'спортмастер', 'декатлон', 'sunlight', 'sokolov'], categoryId: 'shopping' },
  { keywords: ['аптека', 'pharmacy', 'стоматолог', 'врач', 'клиника', 'больница', 'лаборатория', 'инвитро', 'гемотест', 'helix', '36.6', 'горздрав', 'ригла', 'планета здоровья', 'витамин', 'линзы', 'оптика', 'медицин'], categoryId: 'health' },
  { keywords: ['кино', 'кинотеатр', 'театр', 'концерт', 'netflix', 'spotify', 'яндекс плюс', 'яндекс музыка', 'apple music', 'youtube', 'steam', 'playstation', 'xbox', 'развлечен', 'парк', 'музей', 'боулинг', 'караоке', 'vk music', 'иви', 'ivi', 'кинопоиск', 'okko', 'wink', 'premier'], categoryId: 'entertainment' },
  { keywords: ['фитнес', 'fitness', 'спортзал', 'gym', 'тренажёр', 'тренажер', 'бассейн', 'йога', 'world class', 'x-fit', 'alex fitness'], categoryId: 'sport' },
  { keywords: ['красота', 'beauty', 'парикмахер', 'барбер', 'маникюр', 'педикюр', 'салон', 'косметик', 'л\'этуаль', 'рив гош', 'золотое яблоко'], categoryId: 'beauty' },
  { keywords: ['коммунал', 'жкх', 'квартплата', 'аренда', 'rent', 'ипотека', 'электричество', 'газ', 'вода', 'отопление', 'интернет', 'мтс', 'мегафон', 'билайн', 'теле2', 'ростелеком', 'домофон', 'уборка', 'ремонт', 'мебель'], categoryId: 'home' },
  { keywords: ['учёба', 'учеба', 'курс', 'школа', 'университет', 'книга', 'литрес', 'skillbox', 'нетология', 'geekbrains', 'coursera', 'udemy', 'stepik', 'яндекс практикум', 'репетитор'], categoryId: 'education' },
  { keywords: ['путешеств', 'travel', 'отель', 'hotel', 'авиабилет', 'аэропорт', 'booking', 'airbnb', 'островок', 'туту', 'aviasales', 'экскурсия'], categoryId: 'travel' },
  { keywords: ['зарплата', 'salary', 'аванс', 'оклад', 'премия', 'зачисление зарплат'], categoryId: 'salary' },
  { keywords: ['фриланс', 'freelance', 'гонорар', 'подработка'], categoryId: 'freelance' },
  { keywords: ['кэшбэк', 'cashback', 'кешбэк', 'возврат', 'refund', 'возвраты к физику'], categoryId: 'cashback' },
  { keywords: ['инвестиц', 'invest', 'дивиденд', 'акции', 'облигации', 'брокер', 'процент по вклад', 'депозит'], categoryId: 'investment' },
  { keywords: ['подарок', 'gift', 'дарение'], categoryId: 'gift' },
  { keywords: ['снятие наличных', 'банкомат', 'atm', 'alfa iss'], categoryId: 'other_exp' },
];

function detectCategory(description: string, bankCategory: string, amount: number): { categoryId: string; type: 'expense' | 'income' } {
  const desc = description.toLowerCase();
  const bankCat = bankCategory.toLowerCase();
  const isExpense = amount < 0;

  // Skip internal transfers
  if (desc.includes('внутрибанковский перевод') || desc.includes('между счетами')) {
    return { categoryId: '_transfer', type: isExpense ? 'expense' : 'income' };
  }

  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (desc.includes(kw) || bankCat.includes(kw)) {
        return { categoryId: rule.categoryId, type: isExpense ? 'expense' : 'income' };
      }
    }
  }

  if (bankCat.includes('снятие наличных')) return { categoryId: 'other_exp', type: 'expense' };
  if (bankCat.includes('финансовые операции') && isExpense) return { categoryId: 'shopping', type: 'expense' };

  return { categoryId: isExpense ? 'other_exp' : 'other_inc', type: isExpense ? 'expense' : 'income' };
}

function parseAmount(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function parseRuDate(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const match = String(raw).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`).toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export interface ParsedBankTx {
  type: 'expense' | 'income';
  amount: number;
  categoryId: string;
  description: string;
  date: string;
}

async function loadSheetJS(): Promise<any> {
  if (!(window as any).__XLSX__) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load SheetJS'));
      document.head.appendChild(s);
    });
    (window as any).__XLSX__ = (window as any).XLSX;
  }
  return (window as any).__XLSX__;
}

export async function parseBankXLSX(buffer: ArrayBuffer): Promise<{ transactions: ParsedBankTx[]; bankName: string; skipped: number }> {
  const XLSX = await loadSheetJS();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let bankName = 'Банк';
  let headerRow = -1;
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let categoryCol = -1;
  let statusCol = -1;

  for (let i = 0; i < Math.min(25, allRows.length); i++) {
    const row = allRows[i];
    if (!row) continue;
    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('альфа') || rowStr.includes('alfa')) bankName = 'Альфа-Банк';
    else if (rowStr.includes('сбербанк') || rowStr.includes('сбер')) bankName = 'Сбербанк';
    else if (rowStr.includes('тинькофф') || rowStr.includes('т-банк')) bankName = 'Т-Банк';
    else if (rowStr.includes('втб')) bankName = 'ВТБ';
    else if (rowStr.includes('райффайзен')) bankName = 'Райффайзен';

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

  if (headerRow < 0 || dateCol < 0) {
    return parseFallbackXLSX(allRows);
  }

  if (descCol < 0) descCol = 11;
  if (amountCol < 0) amountCol = 12;
  if (categoryCol < 0) categoryCol = 4;

  const transactions: ParsedBankTx[] = [];
  let skipped = 0;

  for (let i = headerRow + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.length === 0) continue;

    const dateRaw = row[dateCol];
    const descRaw = String(row[descCol] ?? '');
    const amountRaw = row[amountCol];
    const bankCategoryRaw = String(row[categoryCol] ?? '');
    const statusRaw = statusCol >= 0 ? String(row[statusCol] ?? '') : '';

    if (!dateRaw && !descRaw && !amountRaw) continue;
    if (statusRaw.toLowerCase().includes('отклон')) { skipped++; continue; }

    const amount = parseAmount(amountRaw);
    if (amount === 0) { skipped++; continue; }

    const { categoryId, type } = detectCategory(descRaw, bankCategoryRaw, amount);
    if (categoryId === '_transfer') { skipped++; continue; }

    let shortDesc = descRaw;
    shortDesc = shortDesc.replace(/^Категория:\s*[^.]+\.\s*/i, '');
    shortDesc = shortDesc.replace(/[A-Z]\d{10,}/g, '');
    shortDesc = shortDesc.replace(/\+?\d{11,}/g, '');
    shortDesc = shortDesc.replace(/через Систему быстрых платежей\.?/gi, '');
    shortDesc = shortDesc.replace(/Без НДС\.?/gi, '');
    shortDesc = shortDesc.replace(/Платеж\s+\S+\s+в\s+/i, '');
    shortDesc = shortDesc.replace(/Перевод\s+\S+\s+/i, '');
    shortDesc = shortDesc.replace(/\s+/g, ' ').trim();
    if (shortDesc.length > 80) shortDesc = shortDesc.substring(0, 80) + '…';
    if (!shortDesc) shortDesc = bankCategoryRaw || 'Операция';

    transactions.push({
      type,
      amount: Math.abs(amount),
      categoryId,
      description: shortDesc,
      date: parseRuDate(String(dateRaw)),
    });
  }

  return { transactions, bankName, skipped };
}

function parseFallbackXLSX(allRows: any[][]): { transactions: ParsedBankTx[]; bankName: string; skipped: number } {
  if (allRows.length < 2) return { transactions: [], bankName: 'Файл', skipped: 0 };
  const headers = (allRows[0] || []).map((h: any) => String(h ?? '').toLowerCase().trim());
  const transactions: ParsedBankTx[] = [];
  let skipped = 0;

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h: string, j: number) => { obj[h] = String(row[j] ?? ''); });
    const tx = rowToTransactionGeneric(obj);
    if (tx) transactions.push(tx);
    else skipped++;
  }
  return { transactions, bankName: 'Файл', skipped };
}

export function rowToTransactionGeneric(row: Record<string, string>): ParsedBankTx | null {
  const type = (row['type'] ?? row['тип'] ?? '').toLowerCase();
  if (type !== 'expense' && type !== 'income' && type !== 'расход' && type !== 'доход') return null;
  const normalizedType: 'expense' | 'income' = (type === 'расход') ? 'expense' : (type === 'доход') ? 'income' : type as 'expense' | 'income';
  const amountRaw = row['amount'] ?? row['сумма'] ?? '';
  const amount = parseFloat(amountRaw.replace(/\s/g, '').replace(',', '.'));
  if (!amount || amount <= 0) return null;
  const categoryId = row['categoryid'] ?? row['category'] ?? row['категория'] ?? 'other';
  const description = row['description'] ?? row['описание'] ?? row['comment'] ?? '';
  const dateRaw = row['date'] ?? row['дата'] ?? '';
  const date = dateRaw ? parseRuDate(dateRaw) : new Date().toISOString();
  return { type: normalizedType, amount, categoryId, description, date };
}

export function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
}
