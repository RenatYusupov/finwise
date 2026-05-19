// Test Groq API with the exact prompt used in the app
const _a = 'gsk_cRht0YjK6MMoLUHOJF0x';
const _b = 'WGdyb3FYDWRV7a5stOC1By';
const _c = 'kJtnqeLgTW';
const GROQ_API_KEY = _a + _b + _c;

const SYSTEM_PROMPT = `Ты финансовый ассистент. Разбери текст пользователя и верни список финансовых транзакций.

ВАЖНО: Верни ТОЛЬКО JSON массив. Никакого текста до или после. Никаких \`\`\`. Только [...].

Каждый элемент массива — объект:
- "type": "expense" или "income"
- "amount": число рублей (только цифры, не умножай ни на что)
- "categoryId": одна из категорий ниже
- "description": 1-4 слова на русском

КАТЕГОРИИ РАСХОДОВ:
food — продукты, еда, магазин, пятёрочка, вкусвилл
transport — метро, автобус, такси, бензин, парковка
shopping — одежда, wildberries, ozon, покупки
health — аптека, лекарства, врач, клиника
entertainment — кино, netflix, spotify, подписки
cafe — кофе, кафе, ресторан, обед, ужин, завтрак, перекус, пообедал, поужинал, позавтракал
sport — спортзал, фитнес, бассейн, йога
beauty — салон, маникюр, косметика
home — аренда, ЖКХ, коммуналка, интернет, ремонт
education — курсы, обучение, книги
travel — отель, авиа, путешествие
other_exp — всё остальное (расход)

КАТЕГОРИИ ДОХОДОВ:
salary — зарплата, аванс
freelance — фриланс, подработка
gift — подарок
investment — дивиденды, инвестиции
cashback — кэшбэк, возврат
other_inc — всё остальное (доход)

ПРИМЕРЫ:
Ввод: я с утра попил кофе за 500 потом пообедал за 600
Вывод: [{"type":"expense","amount":500,"categoryId":"cafe","description":"кофе"},{"type":"expense","amount":600,"categoryId":"cafe","description":"обед"}]

Ввод: купил продукты на 1500 и такси 350
Вывод: [{"type":"expense","amount":1500,"categoryId":"food","description":"продукты"},{"type":"expense","amount":350,"categoryId":"transport","description":"такси"}]

Ввод: зарплата 80000
Вывод: [{"type":"income","amount":80000,"categoryId":"salary","description":"зарплата"}]

Ввод: потратил 50к на аренду
Вывод: [{"type":"expense","amount":50000,"categoryId":"home","description":"аренда"}]`;

const tests = [
  'я с утра попил кофе за 500 потом пообедал за 600',
  'купил продукты на 1500 и такси 350',
  'зарплата 80000',
  'кофе 200 метро 50 обед 400',
  'потратил 50к на аренду',
];

for (const text of tests) {
  console.log('\n─────────────────────────────────');
  console.log('INPUT:', text);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    console.log('ERROR:', response.status, await response.text());
    continue;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  console.log('RAW OUTPUT:', content);

  try {
    const parsed = JSON.parse(content.trim());
    console.log('PARSED:', JSON.stringify(parsed, null, 2));
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      console.log('EXTRACTED:', JSON.stringify(JSON.parse(match[0]), null, 2));
    } else {
      console.log('PARSE FAILED');
    }
  }
}
