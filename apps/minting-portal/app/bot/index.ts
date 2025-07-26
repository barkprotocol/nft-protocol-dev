import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import { Connection, PublicKey } from '@solana/web3.js';
import Redis from 'ioredis';
import { stakeNFT, unstakeNFT, mintPrivateNFT, verifyNFTWithZKSTARK, getSupply, checkYield } from '../utils/solana';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
const MINTS = (process.env.ALLOWED_NFT_MINTS || '').split(',');
const GROUP_LINK = process.env.TELEGRAM_GROUP_LINK!;
const ADMIN_IDS = (process.env.BOT_ADMINS || '').split(',').map(id => parseInt(id));
const MONGODB_URI = process.env.MONGODB_URI!;
const REDIS_URL = process.env.REDIS_URL!;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const connection = new Connection(RPC_URL);
const redis = new Redis(REDIS_URL);

// MongoDB Schema
const verificationSchema = new mongoose.Schema({
  wallet: String,
  userId: Number,
  action: String,
  stakeId: String,
  mint: String,
  result: String,
  error: String,
  yield: Number,
  duration: Number,
  timestamp: Date,
  private: Boolean,
});
const Verification = mongoose.model('Verification', verificationSchema);

mongoose.connect(MONGODB_URI).catch(err => console.error('MongoDB connection error:', err));
const db = mongoose.connection.collection('verifications');

// Rate limiting per command type
async function checkRateLimit(userId: number, command: string): Promise<void> {
  const rateLimitKey = `rate:${userId}:${command}`;
  if (await redis.get(rateLimitKey)) throw new Error(`Wait 60s before retrying ${command}`);
  await redis.set(rateLimitKey, '1', 'EX', 60);
}

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await checkRateLimit(msg.from!.id, 'start');
    const supply = await getSupply();
    const keyboard: InlineKeyboardButton[][] = [
      [{ text: 'Mint Now', url: 'https://mint.barkprotocol.net' }],
      [{ text: 'Stake NFT', callback_data: 'stake' }, { text: 'Unstake NFT', callback_data: 'unstake' }],
      [{ text: 'Check Yield', callback_data: 'checkYield' }, { text: 'List Stakes', callback_data: 'listStakes' }],
      [{ text: 'Supply', callback_data: 'supply' }, { text: 'Learn More', url: 'https://barkprotocol.net' }],
    ];
    bot.sendMessage(chatId, `👋 Welcome to BARK Protocol!\n\nMint NFTs: ${supply.standard} Standard, ${supply.premium} Premium left.\nSend your Solana wallet to verify.`, {
      reply_markup: { inline_keyboard: keyboard },
    });
    await Verification.create({ userId: msg.from!.id, action: 'start', result: 'success', timestamp: new Date() });
  } catch (err: any) {
    await Verification.create({ userId: msg.from!.id, action: 'start', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message!.chat.id;
  const userId = query.from.id;
  try {
    await checkRateLimit(userId, query.data!);
    if (query.data === 'stake') {
      bot.sendMessage(chatId, '📈 Send /stakeNFT <mint> <duration> (30, 60, or 90 days).');
    } else if (query.data === 'unstake') {
      bot.sendMessage(chatId, '📉 Send /unstakeNFT <stakeId>.');
    } else if (query.data === 'checkYield') {
      bot.sendMessage(chatId, '📊 Send /checkYield <stakeId>.');
    } else if (query.data === 'listStakes') {
      bot.sendMessage(chatId, '📋 Send /listStakes to view active stakes.');
    } else if (query.data === 'supply') {
      const supply = await getSupply();
      bot.sendMessage(chatId, `📦 Supply:\nStandard: ${supply.standard}\nPremium: ${supply.premium}`);
    }
    await Verification.create({ userId, action: `callback_${query.data}`, result: 'success', timestamp: new Date() });
  } catch (err: any) {
    await Verification.create({ userId, action: `callback_${query.data}`, result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Stats command (admin-only)
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id ?? 0;
  if (!ADMIN_IDS.includes(userId)) {
    await Verification.create({ userId, action: 'stats', result: 'fail', error: 'Unauthorized', timestamp: new Date() });
    return bot.sendMessage(chatId, '⛔ Unauthorized.');
  }
  try {
    await checkRateLimit(userId, 'stats');
    const [total, success, fail, stakes, unstakes, yields] = await Promise.all([
      db.countDocuments(),
      db.countDocuments({ result: 'success' }),
      db.countDocuments({ result: 'fail' }),
      db.countDocuments({ action: 'stake', result: 'success' }),
      db.countDocuments({ action: 'unstake', result: 'success' }),
      db.find({ action: 'stake', result: 'success' }).toArray().then(docs => docs.reduce((sum, doc) => sum + (doc.yield || 0), 0) / (docs.length || 1)),
    ]);
    bot.sendMessage(chatId, `📊 Stats:\nTotal: ${total}\n✅ Success: ${success}\n❌ Fail: ${fail}\n📈 Stakes: ${stakes}\n📉 Unstakes: ${unstakes}\n💰 Avg Yield: ${yields.toFixed(3)} SOL`);
    await Verification.create({ userId, action: 'stats', result: 'success', timestamp: new Date() });
  } catch (err: any) {
    await Verification.create({ userId, action: 'stats', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Supply command
bot.onText(/\/supply/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    await checkRateLimit(userId, 'supply');
    const supply = await getSupply();
    bot.sendMessage(chatId, `📦 Supply:\nStandard: ${supply.standard}\nPremium: ${supply.premium}`);
    await Verification.create({ userId, action: 'supply', result: 'success', timestamp: new Date() });
  } catch (err: any) {
    await Verification.create({ userId, action: 'supply', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Stake NFT command
bot.onText(/\/stakeNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [mint, duration] = match![1].split(' ');
    if (!['30', '60', '90'].includes(duration)) throw new Error('Invalid duration: 30, 60, or 90 days');
    await checkRateLimit(userId, 'stakeNFT');
    const { stakeId, yield: estimatedYield } = await stakeNFT({ publicKey: msg.text }, mint, parseInt(duration));
    await Verification.create({ userId, action: 'stakeNFT', stakeId, mint, result: 'success', yield: estimatedYield, duration: parseInt(duration), timestamp: new Date() });
    bot.sendMessage(chatId, `📈 Staked ${mint} for ${duration} days. ID: ${stakeId}, Yield: ${estimatedYield.toFixed(3)} SOL`);
  } catch (err: any) {
    await Verification.create({ userId, action: 'stakeNFT', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Unstake NFT command
bot.onText(/\/unstakeNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [stakeId] = match![1].split(' ');
    await checkRateLimit(userId, 'unstakeNFT');
    const { mint } = await unstakeNFT({ publicKey: msg.text }, stakeId);
    await Verification.create({ userId, action: 'unstakeNFT', stakeId, mint, result: 'success', timestamp: new Date() });
    bot.sendMessage(chatId, `📉 Unstaked ${mint} (ID: ${stakeId})`);
  } catch (err: any) {
    await Verification.create({ userId, action: 'unstakeNFT', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Check yield command
bot.onText(/\/checkYield (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [stakeId] = match![1].split(' ');
    await checkRateLimit(userId, 'checkYield');
    const { mint, estimatedYield } = await checkYield(stakeId);
    await Verification.create({ userId, action: 'checkYield', stakeId, mint, result: 'success', yield: estimatedYield, timestamp: new Date() });
    bot.sendMessage(chatId, `📊 Yield for ${mint} (ID: ${stakeId}): ${estimatedYield.toFixed(3)} SOL`);
  } catch (err: any) {
    await Verification.create({ userId, action: 'checkYield', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// List stakes command
bot.onText(/\/listStakes/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    await checkRateLimit(userId, 'listStakes');
    const stakes = await db.find({ userId, action: 'stakeNFT', result: 'success', duration: { $gt: 0 } }).toArray();
    if (stakes.length === 0) {
      bot.sendMessage(chatId, '📋 No active stakes found.');
      return;
    }
    const stakeList = stakes.map(s => `Mint: ${s.mint}, Stake ID: ${s.stakeId}, Yield: ${s.yield.toFixed(3)} SOL, Duration: ${s.duration} days`).join('\n');
    bot.sendMessage(chatId, `📋 Active Stakes:\n${stakeList}`);
    await Verification.create({ userId, action: 'listStakes', result: 'success', timestamp: new Date() });
  } catch (err: any) {
    await Verification.create({ userId, action: 'listStakes', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Transfer NFT command
bot.onText(/\/transferNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [mint, chain, destination] = match![1].split(' ');
    if (!['ethereum', 'bsc'].includes(chain)) throw new Error('Invalid chain: ethereum or bsc');
    await checkRateLimit(userId, 'transferNFT');
    const { txId } = await transferNFTCrossChain(mint, { publicKey: msg.text }, chain, destination);
    await Verification.create({ userId, action: 'transferNFT', mint, result: 'success', timestamp: new Date() });
    bot.sendMessage(chatId, `🌉 Transferred ${mint} to ${chain} (TxID: ${txId})`);
  } catch (err: any) {
    await Verification.create({ userId, action: 'transferNFT', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Mint NFT command
bot.onText(/\/mintNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [type, turnstileToken] = match![1].split(' ');
    if (!['standard', 'premium'].includes(type)) throw new Error('Invalid type: standard or premium');
    await checkRateLimit(userId, 'mintNFT');
    const wallet = { publicKey: msg.text }; // Placeholder, replace with actual wallet
    const collectionId = type === 'standard' ? 0 : 1;
    const { mint } = type === 'standard' ? await mintNFT(wallet, collectionId, turnstileToken) : await mintPrivateNFT(wallet, collectionId, turnstileToken);
    await Verification.create({ userId, action: 'mintNFT', mint, result: 'success', private: type === 'premium', timestamp: new Date() });
    bot.sendMessage(chatId, `🎉 Minted ${type} NFT: ${mint}`);
  } catch (err: any) {
    await Verification.create({ userId, action: 'mintNFT', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

// Wallet verification
bot.on('message', async (msg) => {
  const wallet = msg.text?.trim();
  const userId = msg.from?.id;
  if (!wallet || wallet.startsWith('/')) return;

  try {
    await checkRateLimit(userId!, 'verify');
    const pubkey = new PublicKey(wallet);
    const isValid = await verifyNFTWithZKSTARK(pubkey, MINTS);
    await Verification.create({ wallet, userId, action: 'verify', result: isValid ? 'success' : 'fail', timestamp: new Date() });
    bot.sendMessage(msg.chat.id, isValid ? `✅ NFT verified! Join: ${GROUP_LINK}\nMint: https://mint.barkprotocol.net` : `❌ No BARK NFT found.`);
  } catch (err: any) {
    await Verification.create({ wallet, userId, action: 'verify', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(msg.chat.id, `⚠️ Invalid wallet or RPC error.`);
  }
});

// Error handling
bot.on('polling_error', (err) => console.error('Polling error:', err));

// Metrics logging
async function logMetrics() {
  const [commands, successRate, avgLatency, avgYield] = await Promise.all([
    db.countDocuments({ timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }),
    db.countDocuments({ result: 'success', timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } })
      .then(async success => success / (await db.countDocuments({ timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }) || 1) * 100),
    db.find({ timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }).toArray()
      .then(docs => docs.length ? docs.reduce((sum, doc) => sum + (new Date().getTime() - new Date(doc.timestamp).getTime()), 0) / docs.length / 1000 : 0),
    db.find({ action: 'stakeNFT', result: 'success', timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }).toArray()
      .then(docs => docs.reduce((sum, doc) => sum + (doc.yield || 0), 0) / (docs.length || 1)),
  ]);
  console.log(`Metrics: Commands: ${commands}/hr, Success: ${successRate.toFixed(1)}%, Latency: ${avgLatency.toFixed(1)}s, Avg Yield: ${avgYield.toFixed(3)} SOL`);
}
setInterval(logMetrics, 60 * 60 * 1000); // Log hourly