import { Telegraf, Context, Markup } from 'telegraf';
import 'dotenv/config';
import axios from 'axios';
import QRCode from 'qrcode';
import { Input } from 'telegraf';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// Conversation states
enum ConversationState {
  ADDRESS = 'ADDRESS',
  AMOUNT = 'AMOUNT',
  CONFIRM = 'CONFIRM',
}

// Extended context to store user data
interface BotContext extends Context {
  session?: {
    state?: ConversationState;
    address?: string;
    amountGbpCents?: number;
  };
}

// Initialize bot
const bot = new Telegraf<BotContext>(TOKEN);

// Session middleware (simple in-memory storage)
const sessions = new Map<number, any>();

bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  if (userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, {});
    }
    ctx.session = sessions.get(userId);
  }
  return next();
});

// Start + validate
bot.command('start', async (ctx: BotContext) => {
  const payload = (ctx as unknown as { payload: string })?.payload;
  try {
    if (!payload?.length || payload.length <= 5) {
      ctx.session!.state = ConversationState.ADDRESS;
      await ctx.reply(
        'Welcome! 👋\n\nClick the button below to start purchasing Bitcoin.',
        Markup.keyboard([['Buy Bitcoin']])
          .oneTime()
          .resize()
      );
      return
    }
    const paymentId = payload;
    const address = (ctx as unknown as { session: { address: string } }).session.address!;
    const amount = (ctx as unknown as { session: { amountGbpCents: number } }).session.amountGbpCents!;
    if (!amount) {
      await ctx.reply('❌ Could not link your transaction. Please return to /start');
      return
    }
    // Send validation message
    const validatingMessage =
      `⏳ Validating payment...\n\n` +
      `💷 Amount (GBP): £${Number(amount) / 100}\n\n` +
      `👾 Arkade Address: ${address}\n\n` +
      `🔗 Payment ID: ${paymentId}`;
    await ctx.reply(validatingMessage);
    const { success, message } = (await axios.post(`https://ezp2p-arkade-production.up.railway.app/api/validate`, {
      address,
      proof: {
        amount,
        paymentId
      }
    }).then(res => res.data as {
      success: boolean,
      message: string
    }))
    if (success) {
      const validatedMessage =
        `✅ Validated payment!\n\n` +
        message;
      await ctx.reply(validatedMessage);
      return
    } else {
      const validatedMessage =
        `⚠️ Duplicate payment!\n\n` +
        message;
      await ctx.reply(validatedMessage);
      return
    }
  } catch (error) {
    await ctx.reply('❌ Could not validate proof');
  }
});

// Handle text messages based on conversation state
bot.on('text', async (ctx) => {
  const state = ctx.session?.state;
  const text = ctx.message.text.trim();

  switch (state) {
    case ConversationState.ADDRESS:
      await handleAddressState(ctx, text);
      break;
    case ConversationState.AMOUNT:
      await handleAmountState(ctx, text);
      break;
    case ConversationState.CONFIRM:
      await handleConfirmState(ctx, text);
      break;
    default:
      await ctx.reply('Please use /start to begin.');
  }
});

async function handleAddressState(ctx: BotContext, text: string) {
  if (text === 'Buy Bitcoin') {
    ctx.session!.state = ConversationState.AMOUNT;
    await ctx.reply(
      '📝 Step 1 of 2\n\nPlease enter your Arkade address:',
      Markup.removeKeyboard()
    );
  }
}

async function handleAmountState(ctx: BotContext, address: string) {
  // Basic validation
  if (address.length < 10) {
    await ctx.reply(
      '❌ That doesn\'t look like a valid address.\n\n' +
      'Please enter a valid Arkade address:'
    );
    return;
  }

  // Save address to session
  ctx.session!.address = address;
  ctx.session!.state = ConversationState.CONFIRM;

  console.log(`✅ Arkade address saved: ${address}`);

  // Ask for BTC amount
  await ctx.reply(
    '✅ Arkade address saved!\n\n' +
    '💰 Step 2 of 2\n\n' +
    'Enter the amount of sats you wish to purchase:\n\n' +
    '(Example: 10,000)'
  );
}

async function handleConfirmState(ctx: BotContext, amountSatsText: string) {
  // Remove commas and parse as number
  const cleanedText = amountSatsText.replace(/,/g, '');
  const amountSats = parseFloat(cleanedText);

  // Validate that it's a number
  if (isNaN(amountSats)) {
    await ctx.reply(
      '❌ Invalid number format.\n\n' +
      'Please enter a valid amount of sats (e.g., 10,000):'
    );
    return;
  }

  if (amountSats <= 0) {
    await ctx.reply(
      '❌ Please enter a positive number.\n\n' +
      'Enter the amount of sats you wish to purchase (e.g., 10,000):'
    );
    return;
  }

  if (amountSats <= 0) {
    await ctx.reply(
      '❌ Please enter a positive number.\n\n' +
      'Enter the amount of sats you wish to purchase (e.g., 10,000):'
    );
    return;
  }

  // Get saved address from session
  const address = ctx.session!.address;

  // Calculate GBP amount
  const price = await axios.get('https://mempool.space/api/v1/prices').then(res => res.data as {
    GBP: number
  })
  const amountGbpCents = Math.round((amountSats / 100_000_000) * price.GBP * 100);
  const amountGbp = amountGbpCents / 100;

  const minimumAmountSats = Math.round((100_000_000 / 100) / price.GBP)

  if (amountGbpCents < 1) {
    await ctx.reply(
      '❌ Value too low.\n\n' +
      `You can't buy less than 1p (${minimumAmountSats} sats)`
    );
    return;
  }

  ctx.session!.amountGbpCents = amountGbpCents;

  const paymentUrl = `https://revolut.me/jamesscaur?currency=GBP&amount=${amountGbpCents}`;

  // Generate QR code as buffer
  const qrBuffer = await QRCode.toBuffer(paymentUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  // Send payment instructions
  const message =
    `✅ Purchase details confirmed!\n\n` +
    `🍊 Amount (Sats): ${amountSats}\n` +
    `💷 Amount (GBP): £${amountGbp}\n\n` +
    `👾 Arkade Address: ${address}\n\n` +
    `Scan QR or click button below to pay 👇`;

  const validateUrl = `https://ezp2p-arkade-production.up.railway.app?amount=${amountGbpCents}&address=${address}`

  await ctx.replyWithPhoto(
    Input.fromBuffer(qrBuffer, 'revolut-payment.png'),
    {
      caption: message,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💳 Pay £' + amountGbp.toFixed(2), url: paymentUrl }
          ],
          [{
            text: '✍️ Validate payment',
            url: validateUrl
          }]
        ]
      }
    }
  );
}

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('An error occurred. Please try again or use /cancel to restart.');
});

export async function startBot() {
  console.log('🤖 Starting Telegram bot...');
  await bot.launch();

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  console.log('✅ Bot started');
}
