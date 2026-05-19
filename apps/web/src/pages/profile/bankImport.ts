// ─── Bank Statement Parser ────────────────────────────────────────────────────
//
// Supported formats:
//   • T-Bank (Tinkoff) PDF  — "Справка о движении средств"
//   • Alfa Bank XLSX        — "Выписка по счету"
//   • Generic XLSX/XLS      — column-detection heuristic
//   • CSV / JSON            — generic column mapping
//
// Category detection strategy (layered, highest confidence first):
//   1. MCC code map         — deterministic, covers all Alfa Bank card ops
//   2. Alfa Bank category   — bank's own text category (Транспорт, Кафе и рестораны…)
//   3. Keyword pre-filter   — description/merchant name matching
//   4. Groq LLM batch       — only for remaining uncategorised transactions

// ─── Amount / Date helpers ────────────────────────────────────────────────────

function parseAmount(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const s = String(raw)
    .replace(/\u00a0/g, '')   // non-breaking space
    .replace(/\s/g, '')
    .replace(',', '.');
  return parseFloat(s) || 0;
}

function parseRuDate(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const match = String(raw).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`).toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ─── MCC → category map ───────────────────────────────────────────────────────
// Source: ISO 18245 + Russian bank practice
// Only maps to our 18 category IDs.

const MCC_MAP: Record<number, string> = {
  // Food / groceries
  5411: 'food',   // Grocery stores, supermarkets
  5412: 'food',   // Convenience stores
  5422: 'food',   // Meat/fish stores
  5441: 'food',   // Candy/nut/confectionery
  5451: 'food',   // Dairy products
  5462: 'food',   // Bakeries
  5499: 'food',   // Misc food stores

  // Cafe / restaurants / delivery
  5812: 'cafe',   // Eating places, restaurants
  5813: 'cafe',   // Bars, cocktail lounges
  5814: 'cafe',   // Fast food restaurants
  5815: 'cafe',   // Digital goods: books, movies, music (Yandex Еда app)
  5816: 'entertainment', // Digital goods: games
  5817: 'entertainment', // Digital goods: apps
  5818: 'entertainment', // Digital goods: large merchants

  // Transport
  4111: 'transport',  // Local/suburban commuter transport (Moscow metro/bus)
  4112: 'transport',  // Passenger railways
  4119: 'transport',  // Ambulance services
  4121: 'transport',  // Taxicabs and limousines
  4131: 'transport',  // Bus lines
  4411: 'transport',  // Cruise lines
  4511: 'transport',  // Airlines
  4784: 'transport',  // Tolls/bridge fees
  5541: 'transport',  // Service stations (gas)
  5542: 'transport',  // Automated fuel dispensers
  5571: 'transport',  // Motorcycle shops
  7511: 'transport',  // Truck/utility trailer rentals
  7512: 'transport',  // Car rentals (Belkacar, Delimobil)
  7513: 'transport',  // Truck rentals
  7523: 'transport',  // Parking lots/garages
  7531: 'transport',  // Auto body repair
  7534: 'transport',  // Tire retreading
  7535: 'transport',  // Auto paint shops
  7538: 'transport',  // Auto service shops
  7542: 'transport',  // Car washes

  // Yandex services (MCC 3990 = Yandex Go/Taxi/Delivery)
  3990: 'transport',  // Yandex GO / Taxi / Dostavka — treat as transport by default
  // Note: Yandex Dostavka (food delivery) also uses 3990 — Groq will refine if needed

  // Shopping / retail
  5300: 'shopping',   // Wholesale clubs (Lamoda uses this)
  5310: 'shopping',   // Discount stores
  5311: 'shopping',   // Department stores
  5331: 'shopping',   // Variety stores
  5399: 'shopping',   // Misc general merchandise
  5600: 'shopping',   // Apparel/accessory stores
  5611: 'shopping',   // Men's clothing
  5621: 'shopping',   // Women's clothing
  5631: 'shopping',   // Women's accessories
  5641: 'shopping',   // Children's clothing
  5651: 'shopping',   // Family clothing
  5661: 'shopping',   // Shoe stores
  5691: 'shopping',   // Men's/women's clothing
  5699: 'shopping',   // Misc apparel
  5712: 'home',       // Furniture stores
  5713: 'home',       // Floor covering stores
  5714: 'home',       // Drapery/window covering
  5718: 'home',       // Fireplaces/accessories
  5719: 'home',       // Misc home furnishings
  5722: 'home',       // Household appliance stores
  5731: 'shopping',   // Electronics stores
  5732: 'shopping',   // Electronics stores
  5733: 'entertainment', // Music stores
  5734: 'shopping',   // Computer software stores
  5735: 'entertainment', // Record stores
  5736: 'entertainment', // Musical instruments
  5912: 'health',     // Drug stores/pharmacies
  5940: 'sport',      // Sporting goods
  5941: 'sport',      // Sporting goods stores
  5945: 'entertainment', // Hobby/toy/game shops
  5947: 'beauty',     // Gift/card/novelty shops
  5970: 'shopping',   // Art/craft supplies
  5992: 'shopping',   // Florists (TB TRUECOSTFLOWERS)
  5999: 'shopping',   // Misc retail stores
  5200: 'home',       // Home supply/hardware stores
  5211: 'home',       // Lumber/building materials
  5251: 'home',       // Hardware stores
  5261: 'home',       // Lawn/garden supply
  5065: 'shopping',   // Electrical parts
  5045: 'shopping',   // Computers/peripherals
  5047: 'health',     // Medical/dental/ophthalmic
  5122: 'health',     // Drugs/drug proprietaries

  // Personal services
  7210: 'beauty',     // Laundry/dry cleaning
  7216: 'beauty',     // Dry cleaning
  7217: 'beauty',     // Carpet/upholstery cleaning
  7251: 'beauty',     // Shoe repair
  7261: 'other_exp',  // Funeral services
  7273: 'other_exp',  // Dating/escort services
  7276: 'other_exp',  // Tax preparation
  7277: 'other_exp',  // Counseling services
  7278: 'other_exp',  // Buying/shopping clubs
  7296: 'shopping',   // Clothing rental
  7298: 'beauty',     // Health/beauty spas
  7299: 'other_exp',  // Misc personal services (photo studios, pet shops, etc.)
  7395: 'other_exp',  // Photo finishing labs
  7622: 'shopping',   // Electronics repair
  // Fuel / convenience
  5921: 'food',       // Package stores (beer/wine/liquor)
  5993: 'shopping',   // Cigar stores/stands
  // Courier / delivery
  4215: 'home',       // Courier services (CDEK, Boxberry, etc.)
  // Travel agencies
  4722: 'travel',     // Travel agencies
  // Financial / government
  6538: 'other_exp',  // MerchantQRScan / SBP QR payments (generic)
  9390: 'other_exp',  // Government services
  8661: 'other_exp',  // Religious organizations
  8999: 'other_exp',  // Services not elsewhere classified

  // Health
  8011: 'health',     // Doctors
  8021: 'health',     // Dentists
  8031: 'health',     // Osteopaths
  8041: 'health',     // Chiropractors
  8042: 'health',     // Optometrists
  8049: 'health',     // Podiatrists
  8050: 'health',     // Nursing/personal care
  8062: 'health',     // Hospitals
  8071: 'health',     // Medical/dental labs
  8099: 'health',     // Health practitioners

  // Entertainment
  3991: 'entertainment', // Sber Afisha / ticketing
  7832: 'entertainment', // Motion picture theaters
  7841: 'entertainment', // Video tape rental
  7911: 'entertainment', // Dance halls/studios
  7922: 'entertainment', // Theatrical producers/ticket agencies
  7929: 'entertainment', // Bands/orchestras
  7932: 'entertainment', // Billiard/pool establishments
  7933: 'entertainment', // Bowling alleys
  7941: 'sport',      // Sports clubs / fitness
  7991: 'entertainment', // Tourist attractions
  7993: 'entertainment', // Video game arcades
  7994: 'entertainment', // Video game arcades
  7996: 'entertainment', // Amusement parks
  7997: 'sport',      // Clubs (fitness/country)
  7999: 'entertainment', // Recreation services

  // Beauty
  7230: 'beauty',     // Barber/beauty shops
  7231: 'beauty',     // Beauty shops
  7297: 'beauty',     // Massage parlors
  5977: 'beauty',     // Cosmetic stores

  // Home / utilities / telecom
  4812: 'home',       // Telecom equipment
  4813: 'home',       // Telephone services (МТС, Мегафон)
  4814: 'home',       // Telecom services
  4816: 'home',       // Computer network services
  4821: 'home',       // Telegraph services
  4899: 'home',       // Cable/satellite TV
  4900: 'home',       // Utilities (electric, gas, water)
  6300: 'home',       // Insurance
  7349: 'home',       // Cleaning/maintenance services
  1520: 'home',       // General contractors
  1711: 'home',       // Plumbing/heating
  1731: 'home',       // Electrical work
  1740: 'home',       // Masonry
  1750: 'home',       // Carpentry
  1761: 'home',       // Roofing
  1771: 'home',       // Concrete work
  1799: 'home',       // Special trade contractors

  // Education
  8211: 'education',  // Elementary/secondary schools
  8220: 'education',  // Colleges/universities
  8241: 'education',  // Correspondence schools
  8244: 'education',  // Business/secretarial schools
  8249: 'education',  // Trade/vocational schools
  8299: 'education',  // Schools/educational services
  5942: 'education',  // Book stores
  5192: 'education',  // Books/periodicals

  // Travel — airline MCCs 3000-3099 + hotels/car rental
  3000: 'travel', 3001: 'travel', 3002: 'travel', 3003: 'travel', 3004: 'travel',
  3005: 'travel', 3006: 'travel', 3007: 'travel', 3008: 'travel', 3009: 'travel',
  3010: 'travel', 3011: 'travel', 3012: 'travel', 3013: 'travel', 3014: 'travel',
  3015: 'travel', 3016: 'travel', 3017: 'travel', 3018: 'travel', 3019: 'travel',
  3020: 'travel', 3021: 'travel', 3022: 'travel', 3023: 'travel', 3024: 'travel',
  3025: 'travel', 3026: 'travel', 3027: 'travel', 3028: 'travel', 3029: 'travel',
  3030: 'travel', 3031: 'travel', 3032: 'travel', 3033: 'travel', 3034: 'travel',
  3035: 'travel', 3036: 'travel', 3037: 'travel', 3038: 'travel', 3039: 'travel',
  3040: 'travel', 3041: 'travel', 3042: 'travel', 3043: 'travel', 3044: 'travel',
  3045: 'travel', 3046: 'travel', 3047: 'travel', 3048: 'travel', 3049: 'travel',
  3050: 'travel', 3051: 'travel', 3052: 'travel', 3053: 'travel', 3054: 'travel',
  3055: 'travel', 3056: 'travel', 3057: 'travel', 3058: 'travel', 3059: 'travel',
  3060: 'travel', 3061: 'travel', 3062: 'travel', 3063: 'travel', 3064: 'travel',
  3065: 'travel', 3066: 'travel', 3067: 'travel', 3068: 'travel', 3069: 'travel',
  3070: 'travel', 3071: 'travel', 3072: 'travel', 3073: 'travel', 3074: 'travel',
  3075: 'travel', 3076: 'travel', 3077: 'travel', 3078: 'travel', 3079: 'travel',
  3080: 'travel', 3081: 'travel', 3082: 'travel', 3083: 'travel', 3084: 'travel',
  3085: 'travel', 3086: 'travel', 3087: 'travel', 3088: 'travel', 3089: 'travel',
  3090: 'travel', 3091: 'travel', 3092: 'travel', 3093: 'travel', 3094: 'travel',
  3095: 'travel', 3096: 'travel', 3097: 'travel', 3098: 'travel', 3099: 'travel',
  7011: 'travel',   // Hotels/motels
  7012: 'travel',   // Timeshares
  7032: 'travel',   // Sporting/recreational camps
  7033: 'travel',   // Trailer parks/campgrounds

  // ATM / cash — expense side is 'other_exp', income side is 'cashback'
  // categoryFromMCC() handles the income/expense split
  6010: 'cashback',   // Manual cash disbursements (income = cashback, expense = other_exp via override)
  6011: 'other_exp',  // ATM cash withdrawals — always expense; income ATM = cashback handled by keyword
  6012: 'cashback',   // Financial institutions
  6051: 'cashback',   // Non-financial institutions
};

/** Look up category by MCC code. Returns null if not mapped. */
function categoryFromMCC(mcc: number, type: 'expense' | 'income'): string | null {
  const cat = MCC_MAP[mcc];
  if (!cat) return null;
  // Validate income/expense alignment
  const isIncomeCategory = ['salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc'].includes(cat);
  if (type === 'income' && !isIncomeCategory) return null;
  if (type === 'expense' && isIncomeCategory) return null;
  return cat;
}

/** Extract MCC code from Alfa Bank description string. Returns null if not found.
 *  Handles both formats:
 *   "…, MCC: 3990"   (standard card op format)
 *   "…RUR MCC5300"   (legacy/alternative format without colon)
 */
function extractMCC(description: string): number | null {
  // Format 1: "MCC: 3990" or "MCC:3990"
  const m1 = description.match(/MCC:\s*(\d{4})/i);
  if (m1) return parseInt(m1[1]!, 10);
  // Format 2: "MCC5300" (no colon, no space)
  const m2 = description.match(/\bMCC(\d{4})\b/i);
  if (m2) return parseInt(m2[1]!, 10);
  return null;
}

/** Extract merchant name from Alfa Bank card operation description.
 *  Input: "Операция по карте: 220015******1774, дата создания транзакции: 13-04-2026,
 *          место совершения операции: RU/MOSKVA/YANDEX 4121 GO, MCC: 3990"
 *  Output: "YANDEX 4121 GO"
 */
function extractAlfaMerchant(description: string): string | null {
  // Extract "место совершения операции: COUNTRY/CITY/MERCHANT_NAME"
  const m = description.match(/место совершения операции:\s*[A-Z]{2}\/[^/]+\/(.+?)(?:,\s*MCC|$)/i);
  if (!m) return null;
  let merchant = m[1]!.trim();
  // Remove trailing MCC if regex didn't catch it
  merchant = merchant.replace(/,?\s*MCC:\s*\d+/i, '').trim();
  return merchant || null;
}

// ─── Alfa Bank text category → our category ──────────────────────────────────

const ALFA_CATEGORY_MAP: Record<string, string> = {
  // Transport
  'транспорт': 'transport',
  'топливо': 'transport',
  // Cafe / food
  'кафе и рестораны': 'cafe',
  'рестораны': 'cafe',
  'продукты': 'food',
  'супермаркеты': 'food',
  // Health
  'аптеки': 'health',
  'здоровье': 'health',
  'медицина': 'health',
  // Shopping
  'одежда и обувь': 'shopping',
  'одежда': 'shopping',
  'электроника': 'shopping',
  'маркетплейсы': 'shopping',
  'хобби и увлечения': 'shopping',
  // Entertainment
  'развлечения': 'entertainment',
  'кино': 'entertainment',
  // Sport
  'спорт': 'sport',
  'фитнес': 'sport',
  // Beauty
  'красота': 'beauty',
  'салоны красоты': 'beauty',
  // Home / utilities
  'жкх': 'home',
  'коммунальные услуги': 'home',
  'коммунальные платежи': 'home',
  'телефон, интернет, тв': 'home',
  'связь': 'home',
  'товары для дома': 'home',
  'семья и дети': 'home',
  'животные': 'home',
  // Education
  'образование': 'education',
  // Travel
  'путешествия': 'travel',
  'отели': 'travel',
  'авиабилеты': 'travel',
  // Other expense
  'прочие расходы': 'other_exp',
  'штрафы и налоги': 'other_exp',
  'благотворительность': 'other_exp',
  // Income
  'зарплата': 'salary',
  'кэшбэк': 'cashback',
  'возврат': 'cashback',
  'снятие наличных': 'cashback',  // ATM withdrawal — treat as cashback for income side
};

function categoryFromAlfaText(bankCategory: string, type: 'expense' | 'income'): string | null {
  const key = bankCategory.toLowerCase().trim();
  const cat = ALFA_CATEGORY_MAP[key];
  if (!cat) return null;
  const isIncomeCategory = ['salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc'].includes(cat);
  if (type === 'income' && !isIncomeCategory) return null;
  if (type === 'expense' && isIncomeCategory) return null;
  return cat;
}

// ─── Keyword pre-categorisation ───────────────────────────────────────────────
// Fallback when MCC and Alfa category don't match.

const KEYWORD_RULES: Array<{ pattern: RegExp; category: string }> = [
  // Food / groceries — includes SBP merchant names like "Лента-1453", "VKUSVILL_KSO"
  { pattern: /пятёрочк|пятерочк|магнит\b|вкусвилл|vkusvill|лента[-_\s]|лента\b|ашан|дикси|окей\b|глобус|fix.?price|перекрёсток|перекресток|metro.?cash|spar|billa|атак|карусель|продукт|гастроном|супермаркет|гипермаркет|magnoliya|magnolia|arkadiya|khoroshiy.?den|azbuka.?vku|азбука.?вкус|красная.?икра|мираторг|miratorg|globus|auchan/i, category: 'food' },
  // Cafe / restaurants / delivery
  { pattern: /кофе|кафе|ресторан|бар\b|столовая|фастфуд|макдоналдс|mcdonald|kfc|бургер|пицца|суши|шаурма|самокат|яндекс.?еда|delivery|domino|papa.?john|subway|burger.?king|starbucks|coffee|surf.?coffee|cofix|dodo|вкусно.?и.?точка|fobo|rockets|khinkalych|zoe\b|terrapieno|tacobar|remykitchen|starter.?pay|vice\b|klimentovskij|ycp\b|paveletskiye.?bani|bani\b/i, category: 'cafe' },
  // Transport
  { pattern: /метро|такси|автобус|электричка|ржд|поезд|бензин|азс|парковка|каршеринг|яндекс.?такси|uber|ситидрайв|делимобиль|аэроэкспресс|газпромнефть|лукойл|роснефть|shell|топлив|mos\.transport|belkacar|yandex.{0,20}(go|taxi|доставка|dostavka)|mos\.transport/i, category: 'transport' },
  // Shopping — includes SBP merchant names like "Lamoda_SBP", "WILDBERRIES_SBP"
  { pattern: /wildberries|wb\b|ozon|lamoda|aliexpress|amazon|zara|h&m|uniqlo|adidas|nike|мвидео|эльдорадо|dns\b|ситилинк|икеа|леруа|спортмастер|декатлон|электроник|ювелир|золото|серебро|одежд|обувь|tbank.?avito|авито/i, category: 'shopping' },
  // Health
  { pattern: /аптек|лекарств|врач|клиник|больниц|стоматолог|лаборатор|инвитро|гемотест|helix|36\.6|горздрав|ригла|оптик|медицин|здоровь|фармац|netmonet/i, category: 'health' },
  // Entertainment
  { pattern: /кино|театр|концерт|netflix|spotify|яндекс.?плюс|apple.?music|youtube|steam|playstation|xbox|боулинг|музей|парк|аттракцион|кинопоиск|okko|иви|premier|more.?tv|билет|ticketland|kassir|afisha/i, category: 'entertainment' },
  // Sport
  { pattern: /фитнес|спортзал|gym|бассейн|йога|тренажёр|world.?class|x.?fit|alex.?fitness|fitmost|спорт.?клуб/i, category: 'sport' },
  // Beauty
  { pattern: /салон|маникюр|педикюр|парикмахер|барбер|косметик|л'этуаль|летуаль|рив.?гош|золотое.?яблоко|gold.?apple|beauty|nail|spa\b/i, category: 'beauty' },
  // Home / utilities / telecom
  { pattern: /аренда|жкх|коммунал|квартплат|ипотек|электричеств|газ\b|вода\b|отоплени|интернет|мтс\b|мегафон|билайн|теле2|ростелеком|ремонт|мебель|уборк|домофон|управляющ|cdek|сдэк|boxberry|боксберри|почта.?рос/i, category: 'home' },
  // Education
  { pattern: /курс|обучени|школ|университет|книг|литрес|skillbox|нетологи|coursera|udemy|яндекс.?практикум|репетитор|образовани|российская.?экономическая/i, category: 'education' },
  // Travel
  { pattern: /отель|авиабилет|аэропорт|booking|airbnb|туту|aviasales|путешестви|экскурси|туризм|hotel|hostel|resort|тур\b/i, category: 'travel' },
  // Income — salary (must check type=income in caller)
  { pattern: /зарплат|аванс|оклад|премия|зачислени.{0,20}зарплат|перевод.{0,20}начислени|начислени.{0,20}зарплат|начислени.{0,20}отпуск|плат\.вед\.|заработная.?плата|отпускн|отпуск.{0,10}за\s+\d/i, category: 'salary' },
  // Income — cashback / refund (Alfa Bank "Возврат CXXX..." codes are purchase refunds)
  { pattern: /кэшбэк|cashback|возврат.{0,20}средств|refund|возврат.{0,20}покупк|сберчаевые|возврат.{0,20}физику|возвраты.{0,20}физику|^возврат\s+[A-Z]\d|страховое.{0,20}возмещени/i, category: 'cashback' },
  // Income — investment
  { pattern: /дивиденд|купон|процент.{0,20}(вклад|депозит|остаток|счет)/i, category: 'investment' },
  // Expense — taxes / government fees
  { pattern: /фнс|налог|госпошлин|штраф.{0,20}(гибдд|пдд|налог)|пени\b/i, category: 'other_exp' },
];

export function guessCategory(description: string, bankCategory: string, type: 'expense' | 'income'): string | null {
  const text = `${description} ${bankCategory}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      const isIncomeCategory = ['salary', 'freelance', 'gift', 'investment', 'cashback', 'other_inc'].includes(rule.category);
      if (type === 'income' && !isIncomeCategory) continue;
      if (type === 'expense' && isIncomeCategory) continue;
      return rule.category;
    }
  }
  return null;
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface ParsedBankTx {
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  categoryId: string;
  description: string;
  /** Raw bank category string — passed to Groq for better classification */
  bankCategory: string;
  date: string;
  /** true = MCC/keyword-matched, no need to send to Groq */
  categoryConfident?: boolean;
}

// ─── PDF.js loader ────────────────────────────────────────────────────────────

async function loadPdfJs(): Promise<any> {
  if ((window as any).__PDFJS_LIB__) return (window as any).__PDFJS_LIB__;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(s);
  });
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF.js not available after load');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  (window as any).__PDFJS_LIB__ = pdfjsLib;
  return pdfjsLib;
}

// ─── T-Bank PDF parser ────────────────────────────────────────────────────────
//
// PDF text layout (from pdfplumber analysis):
//   "DD.MM.YYYY HH:MM  DD.MM.YYYY HH:MM  ±N NNN.NN ₽  ±N NNN.NN ₽  Description  CardNum"

const TBANK_TX_REGEX =
  /^(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}\s+\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s+([+-][\d\s]+[.,]\d{2})\s*₽\s+([+-][\d\s]+[.,]\d{2})\s*₽\s+(.+?)(?:\s+\d{4})?$/;

const TBANK_TX_SIMPLE_REGEX =
  /(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}.*?([+-][\d\s]+[.,]\d{2})\s*₽.*?([+-][\d\s]+[.,]\d{2})\s*₽\s+(.+)/;

function cleanTbankDesc(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s+\d{4}$/, '');
  s = s.replace(/^Оплата в\s+/i, '');
  s = s.replace(/\s+[A-Z][a-z]+\s+[A-Z]{2,3}$/, '');
  s = s.replace(/https?:\/\/\S+/gi, '').trim();
  s = s.replace(/^Пополнение\.\s*/i, '');
  s = s.replace(/Внешний перевод по номеру телефона\s+\+?\d+/i, 'Перевод по телефону');
  s = s.replace(/Внутрибанковский перевод с договора\s+\d+/i, 'Внутренний перевод');
  s = s.replace(/\.\s*Система быстрых платежей/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.substring(0, 80) + '…';
  return s || 'Операция';
}

export async function parseTbankPDF(
  buffer: ArrayBuffer
): Promise<{ transactions: ParsedBankTx[]; bankName: string; skipped: number }> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const transactions: ParsedBankTx[] = [];
  let skipped = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group text items by Y position → reconstruct lines
    const lineMap = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of textContent.items as any[]) {
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], text: item.str });
    }

    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const line = items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();

      if (!/^\d{2}\.\d{2}\.\d{4}/.test(line)) continue;

      let dateStr = '';
      let amountStr = '';
      let descRaw = '';

      const m1 = line.match(TBANK_TX_REGEX);
      if (m1) {
        dateStr = m1[1]!;
        amountStr = m1[3]!;
        descRaw = m1[4]!;
      } else {
        const m2 = line.match(TBANK_TX_SIMPLE_REGEX);
        if (m2) {
          dateStr = m2[1]!;
          amountStr = m2[3]!;
          descRaw = m2[4]!;
        } else {
          skipped++;
          continue;
        }
      }

      const amount = parseAmount(amountStr);
      if (amount === 0) { skipped++; continue; }

      const descClean = cleanTbankDesc(descRaw);

      // Skip internal transfers (but keep SBP incoming)
      if (/внутрибанковский перевод|между счетами/i.test(descClean)) {
        skipped++;
        continue;
      }

      const type: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
      const bankCategory = type === 'expense' ? 'Расход' : 'Доход';
      const guessed = guessCategory(descClean, bankCategory, type);

      transactions.push({
        type,
        amount: Math.abs(amount),
        categoryId: guessed ?? (type === 'expense' ? 'other_exp' : 'other_inc'),
        description: descClean,
        bankCategory,
        date: parseRuDate(dateStr),
        categoryConfident: guessed !== null,
      });
    }
  }

  return { transactions, bankName: 'Т-Банк', skipped };
}

// ─── SheetJS loader ───────────────────────────────────────────────────────────

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

// ─── XLSX parser (Alfa Bank + generic) ───────────────────────────────────────

export async function parseBankXLSX(
  buffer: ArrayBuffer
): Promise<{ transactions: ParsedBankTx[]; bankName: string; skipped: number }> {
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

  // Scan up to row 30 to find both bank name and header row.
  // Alfa Bank files have "Выписка по счету" in row 6 but no "Альфа" text —
  // detect by presence of "Операции по счету" or "Дата операции" header pattern.
  for (let i = 0; i < Math.min(30, allRows.length); i++) {
    const row = allRows[i];
    if (!row) continue;
    const rowStr = row.join(' ').toLowerCase();

    // Bank name detection
    if (rowStr.includes('альфа') || rowStr.includes('alfa')) bankName = 'Альфа-Банк';
    else if (rowStr.includes('сбербанк') || rowStr.includes('сбер')) bankName = 'Сбербанк';
    else if (rowStr.includes('тинькофф') || rowStr.includes('т-банк') || rowStr.includes('tbank')) bankName = 'Т-Банк';
    else if (rowStr.includes('втб')) bankName = 'ВТБ';
    else if (rowStr.includes('райффайзен')) bankName = 'Райффайзен';
    // Alfa Bank "Выписка по счету" signature — no bank name in text but recognizable structure
    if (bankName === 'Банк' && rowStr.includes('выписка по счету')) bankName = 'Альфа-Банк';
    if (bankName === 'Банк' && rowStr.includes('операции по счету')) bankName = 'Альфа-Банк';

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
    console.warn('[bankImport] Header not found — falling back to generic parser');
    return parseFallbackXLSX(allRows);
  }

  // Alfa Bank column defaults (verified against real export)
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
    const dateStr = String(dateRaw ?? '');

    if (!dateRaw && !descRaw && !amountRaw) continue;
    // Skip HOLD rows (unconfirmed) — keep them, just note status
    if (statusRaw.toLowerCase().includes('отклон')) { skipped++; continue; }
    // Skip footer/signature rows
    if (!dateStr.match(/^\d{2}\.\d{2}\.\d{4}/) && !dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      if (!dateRaw || String(dateRaw).trim() === '') { skipped++; continue; }
    }

    const amount = parseAmount(amountRaw);
    if (amount === 0) { skipped++; continue; }

    // Handle internal bank transfers between own accounts.
    // Incoming transfers (amount > 0) are always skipped — they are just
    // money moving between own accounts and should not inflate income.
    // Outgoing transfers (amount < 0) are kept as type='transfer' so that
    // recurring mandatory payments (e.g. loan repayment routed via an
    // intermediate own account) are visible in the transaction history
    // and can be detected by the recurring-payment algorithm.
    const descLower = descRaw.toLowerCase();
    const isInternalTransfer =
      descLower.includes('внутрибанковский перевод') &&
      descLower.includes('между счетами');
    if (isInternalTransfer) {
      const parsedAmount = parseAmount(amountRaw);
      if (parsedAmount >= 0) {
        // Incoming own-account transfer — skip entirely
        skipped++;
        continue;
      }
      // Outgoing own-account transfer — import as 'transfer' type
      // (will be excluded from alreadySpent but visible for recurring detection)
    }

    // Internal outgoing transfers are kept as 'transfer' so they appear in
    // transaction history (for recurring-payment detection) but are excluded
    // from alreadySpent in the budget calculation.
    const type: 'expense' | 'income' | 'transfer' = isInternalTransfer
      ? 'transfer'
      : amount < 0 ? 'expense' : 'income';

    // Category helpers only understand 'expense' | 'income' — transfers are
    // treated as expenses for category-lookup purposes only.
    const categoryType: 'expense' | 'income' = type === 'income' ? 'income' : 'expense';

    // ── Category detection (priority order) ──────────────────────────────────

    // 1. MCC code from description (most reliable for card ops)
    const mcc = extractMCC(descRaw);
    let categoryId: string | null = mcc !== null ? categoryFromMCC(mcc, categoryType) : null;
    let categoryConfident = categoryId !== null;

    // 2. Alfa Bank text category (column 4)
    if (!categoryId) {
      categoryId = categoryFromAlfaText(bankCategoryRaw, categoryType);
      categoryConfident = categoryId !== null;
    }

    // ── Build clean description ───────────────────────────────────────────────

    let shortDesc: string;

    if (descRaw.includes('Операция по карте')) {
      // Card operation: extract merchant name from "место совершения операции: RU/CITY/MERCHANT"
      const merchant = extractAlfaMerchant(descRaw);
      if (merchant) {
        shortDesc = merchant;
      } else {
        shortDesc = descRaw.replace(/Операция по карте:.*?место совершения операции:\s*/i, '').replace(/,\s*MCC:\s*\d+/i, '').trim();
      }
    } else {
      // SBP transfer, payroll, etc.
      shortDesc = descRaw;

      // Strip "Категория: Исходящий платеж QR по СБП C2B." prefix and extract merchant
      // e.g. "Категория: Исходящий платеж QR по СБП C2B.Платеж C210511250825810 в Lamoda_SBP через СБП."
      //   → "Lamoda_SBP"
      const sbpMerchantMatch = shortDesc.match(/Платеж\s+\S+\s+в\s+([^\s.]+(?:\s+[^\s.]+)*?)(?:\s+через|\.|$)/i);
      if (sbpMerchantMatch) {
        shortDesc = sbpMerchantMatch[1]!
          .replace(/_SBP$/i, '')
          .replace(/_/g, ' ')
          .trim();
      } else {
        shortDesc = shortDesc.replace(/^Категория:\s*[^.]+\.\s*/i, '');
        shortDesc = shortDesc.replace(/Перевод\s+[A-Z0-9]+\s+через Систему быстрых платежей\s+(на|от)\s+/i, 'СБП → ');
        shortDesc = shortDesc.replace(/через Систему быстрых платежей\.?/gi, '');
        shortDesc = shortDesc.replace(/Без НДС\.?/gi, '');
        shortDesc = shortDesc.replace(/Платеж\s+\S+\s+в пользу\s+/i, '');
        shortDesc = shortDesc.replace(/Перевод\s+\S+\s+/i, '');
        // "Перевод начисления Зарплата за 10.2025" → "Зарплата за 10.2025"
        shortDesc = shortDesc.replace(/Перевод начисления\s+/i, '');
        shortDesc = shortDesc.replace(/Перевод клиенту\s+/i, 'Перевод: ');
        shortDesc = shortDesc.replace(/Перевод от клиента\s+/i, 'Перевод от: ');
        shortDesc = shortDesc.replace(/\.\s*Перевод денежных средств/i, '');
        shortDesc = shortDesc.replace(/по номеру\s+\d+\*+\d+/i, '');
        // "ПЛАТ.ВЕД. 309132 от 05.11.2025 Юсупов Ренат Равильевич Оплата Заработная плата"
        // → "Заработная плата"
        shortDesc = shortDesc.replace(/ПЛАТ\.ВЕД\.\s*\d+\s+от\s+[\d.]+\s+[А-ЯЁа-яё\s]+Оплата\s+/i, '');
        shortDesc = shortDesc.replace(/\s+/g, ' ').trim();
      }
    }

    if (shortDesc.length > 80) shortDesc = shortDesc.substring(0, 80) + '…';
    if (!shortDesc) shortDesc = bankCategoryRaw || 'Операция';

    // 3. Keyword match on cleaned description (if MCC/Alfa category didn't match)
    if (!categoryId) {
      // Pass both cleaned desc and raw desc — raw catches patterns like "Возвраты к физику"
      // that get stripped during cleaning
      categoryId = guessCategory(shortDesc + ' ' + descRaw, bankCategoryRaw, categoryType);
      categoryConfident = categoryId !== null;
    }

    // 4. SBP P2P transfer to phone number — always a personal transfer
    // e.g. "Перевод XXXX через Систему быстрых платежей на +79165787566"
    // e.g. "Категория: Прочие операции. Перевод ... +79165787566"
    if (!categoryId && /\+7\d{10}\b/.test(descRaw)) {
      categoryId = type === 'expense' ? 'other_exp' : 'other_inc';
      categoryConfident = true;
    }

    // Special case: salary/payroll detection from description
    if (!categoryId && categoryType === 'income') {
      if (/аванс|зарплат|оклад|начислени/i.test(shortDesc)) {
        categoryId = 'salary';
        categoryConfident = true;
      }
    }

    transactions.push({
      type,
      amount: Math.abs(amount),
      categoryId: categoryId ?? (type === 'income' ? 'other_inc' : 'other_exp'),
      description: shortDesc,
      bankCategory: bankCategoryRaw,
      date: parseRuDate(dateStr),
      categoryConfident,
    });
  }

  return { transactions, bankName, skipped };
}

function parseFallbackXLSX(
  allRows: any[][]
): { transactions: ParsedBankTx[]; bankName: string; skipped: number } {
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

// ─── Generic CSV / JSON helpers ───────────────────────────────────────────────

export function rowToTransactionGeneric(row: Record<string, string>): ParsedBankTx | null {
  const type = (row['type'] ?? row['тип'] ?? '').toLowerCase();
  if (type !== 'expense' && type !== 'income' && type !== 'расход' && type !== 'доход') return null;
  const normalizedType: 'expense' | 'income' =
    type === 'расход' ? 'expense' : type === 'доход' ? 'income' : (type as 'expense' | 'income');
  const amountRaw = row['amount'] ?? row['сумма'] ?? '';
  const amount = parseFloat(amountRaw.replace(/\s/g, '').replace(',', '.'));
  if (!amount || amount <= 0) return null;
  const description = row['description'] ?? row['описание'] ?? row['comment'] ?? '';
  const bankCategory = row['bankcategory'] ?? row['банккатегория'] ?? '';
  const guessed = guessCategory(description, bankCategory, normalizedType);
  const categoryId = guessed ?? row['categoryid'] ?? row['category'] ?? row['категория'] ?? (normalizedType === 'expense' ? 'other_exp' : 'other_inc');
  const dateRaw = row['date'] ?? row['дата'] ?? '';
  const date = dateRaw ? parseRuDate(dateRaw) : new Date().toISOString();
  return { type: normalizedType, amount, categoryId, description, bankCategory, date, categoryConfident: guessed !== null };
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
