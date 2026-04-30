/**
 * Simple FinWise Telegram Bot
 * Responds to /start with a WebApp button to open the app
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8766986886:AAGylytLiXiFo3tePAx4xgBfXib2Osv1WOM';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://floppy-hornets-try.loca.lt';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

async function apiCall(method, body = {}) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendWebAppMessage(chatId) {
  return apiCall('sendMessage', {
    chat_id: chatId,
    text: '🦉 *FinWise* — твой умный финансовый помощник!\n\nНажми кнопку ниже, чтобы открыть приложение:',
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '💰 Открыть FinWise',
          web_app: { url: WEBAPP_URL }
        }
      ]]
    }
  });
}

async function poll() {
  console.log(`🤖 FinWise bot started!`);
  console.log(`📱 WebApp URL: ${WEBAPP_URL}`);
  console.log(`🔗 Open bot: https://t.me/finwise_test_bot`);
  console.log('Waiting for messages...\n');

  while (true) {
    try {
      const data = await apiCall('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });

      if (!data.ok) {
        console.error('API error:', data);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;

        const msg = update.message;
        if (!msg) continue;

        const chatId = msg.chat.id;
        const text = msg.text || '';
        const username = msg.from?.username || msg.from?.first_name || 'друг';

        console.log(`📨 Message from @${username}: ${text}`);

        if (text.startsWith('/start') || text.startsWith('/app')) {
          await sendWebAppMessage(chatId);
          console.log(`✅ Sent WebApp button to @${username}`);
        } else {
          // Any other message — also send the button
          await sendWebAppMessage(chatId);
        }
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

poll();
