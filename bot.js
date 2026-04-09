const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// === CONFIG (set these as environment variables on Render) ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

if (!TELEGRAM_TOKEN || !GROQ_API_KEY) {
  console.error('Missing TELEGRAM_TOKEN or GROQ_API_KEY environment variables!');
  process.exit(1);
}

// === SYSTEM PROMPT - Customize this for any business! ===
const SYSTEM_PROMPT = `You are a friendly, helpful customer support assistant for Linklet — a campus marketplace where university students buy, sell, and trade items.

Website: www.linklet.co.ke

Key info:
- Students can list items for sale (electronics, books, furniture, clothes, etc.)
- Buyers browse and chat with sellers directly
- The platform is completely free to use
- Available as a web app at www.linklet.co.ke
- Payments are handled between buyer and seller (M-Pesa recommended)
- Users must sign up with a valid email to post listings
- Listings include photos, descriptions, prices, and location
- There is a built-in chat feature to negotiate with sellers
- Report suspicious listings or users via the app

Rules:
- Keep responses short and helpful (2-3 sentences max)
- Be warm and conversational, use casual tone
- If someone asks something you don't know, direct them to the website or say you'll escalate to the team
- If someone wants to list an item, guide them to sign up at www.linklet.co.ke
- Always be encouraging about the platform
- Reply in the same language the user writes in`;

// Store conversation history per chat (last 10 messages)
const chatHistory = new Map();

function getHistory(chatId) {
  if (!chatHistory.has(chatId)) {
    chatHistory.set(chatId, []);
  }
  return chatHistory.get(chatId);
}

function addToHistory(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  // Keep only last 10 messages to save tokens
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
}

async function getAIResponse(chatId, userMessage) {
  addToHistory(chatId, 'user', userMessage);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getHistory(chatId)
  ];

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: GROQ_MODEL,
      messages,
      max_tokens: 300,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = response.data.choices[0].message.content;
    addToHistory(chatId, 'assistant', reply);
    return reply;
  } catch (error) {
    console.error('Groq API error:', error.response?.data || error.message);
    return "Sorry, I'm having a little trouble right now! 🙏 Please visit www.linklet.co.ke or try again in a moment.";
  }
}

// === START BOT (Polling mode - no HTTPS needed!) ===
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('🤖 Linklet Support Bot is running...');
console.log('Send a message to your bot on Telegram to test it!\n');

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const welcome = `👋 Welcome to Linklet!

I'm your AI assistant for Kenya's campus marketplace — where university students buy, sell, and trade items safely.

🛒 Browse & buy from fellow students
💰 List items for free and reach buyers instantly
💬 Chat directly with sellers
📱 M-Pesa payments supported

🌐 Visit: www.linklet.co.ke

Ask me anything — I'm here 24/7!`;

  bot.sendMessage(msg.chat.id, welcome);
});

// Handle all other messages
bot.on('message', async (msg) => {
  // Skip commands
  if (msg.text && msg.text.startsWith('/')) return;
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'there';

  console.log(`[${new Date().toLocaleTimeString()}] ${userName}: ${msg.text}`);

  // Show typing indicator
  bot.sendChatAction(chatId, 'typing');

  const reply = await getAIResponse(chatId, msg.text);

  console.log(`[${new Date().toLocaleTimeString()}] Bot: ${reply}\n`);

  bot.sendMessage(chatId, reply);
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});

console.log('Press Ctrl+C to stop the bot.\n');
