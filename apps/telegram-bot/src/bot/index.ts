import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import { Connection, PublicKey } from '@solana/web3.js';
import Redis from 'ioredis';
import { stakeNFT, unstakeNFT, mintPrivateNFT, verifyNFTWithZKSTARK } from '../utils/solana';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const RPC_URL = process.env.SOLANA_RPC_URL!;
const MINTS = (process.env.ALLOWED_NFT_MINTS || '').split(',');
const GROUP_LINK = process.env.TELEGRAM_GROUP_LINK!;
const ADMIN_IDS = (process.env.BOT_ADMINS || '').split(',').map(id => parseInt(id));
const MONGODB_URI = process.env.MONGODB_URI!;
const REDIS_URL = process.env.REDIS_URL!;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const connection = new Connection(RPC_URL);
const redis = new Redis(REDIS_URL);
const userTimestamps = new Map<number, number>();

mongoose.connect(MONGODB_URI);
const db = mongoose.connection.collection('verifications');

bot.onText(/\/start/, (msg) => {
  const keyboard: InlineKeyboardButton[][] = [
    [{ text: 'Learn More', url: 'https://barkprotocol.net' }],
    [{ text: 'Retry', callback_data: 'retry' }],
    [{ text: 'Stake NFT', callback_data: 'stake' }],
    [{ text: 'Unstake NFT', callback_data: 'unstake' }],
  ];
  bot.sendMessage(msg.chat.id, '👋 Welcome to BARK Protocol!\n\nSend your Solana wallet address to verify NFT access.', {
    reply_markup: { inline_keyboard: keyboard },
  });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message!.chat.id;
  if (query.data === 'retry') {
    bot.sendMessage(chatId, '🔁 Resend your Solana wallet address.');
  } else if (query.data === 'stake') {
    bot.sendMessage(chatId, '📈 Send /stakeNFT <mint> <duration> (30, 60, or 90 days).');
  } else if (query.data === 'unstake') {
    bot.sendMessage(chatId, '📉 Send /unstakeNFT <stakeId>.');
  }
});

bot.onText(/\/stats/, async (msg) => {
  if (!ADMIN_IDS.includes(msg.from?.id ?? 0)) {
    return bot.sendMessage(msg.chat.id, '⛔ Unauthorized.');
  }
  const [total, success, fail] = await Promise.all([
    db.countDocuments(),
    db.countDocuments({ result: 'success' }),
    db.countDocuments({ result: 'fail' }),
  ]);
  bot.sendMessage(msg.chat.id, `📊 Stats:\nTotal: ${total}\n✅ Success: ${success}\n❌ Fail: ${fail}`);
});

bot.onText(/\/stakeNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [mint, duration] = match![1].split(' ');
    if (!['30', '60', '90'].includes(duration)) throw new Error('Invalid duration: 30, 60, or 90 days');
    const rateLimitKey = `rate:${userId}`;
    if (await redis.get(rateLimitKey)) throw new Error('Wait 60s between commands');
    await redis.set(rateLimitKey, '1', 'EX', 60);

    const { stakeId, yield: estimatedYield } = await stakeNFT({ publicKey: msg.text }, mint, parseInt(duration));
    await db.insertOne({ userId, action: 'stake', stakeId, mint, result: 'success', timestamp: new Date() });
    bot.sendMessage(chatId, `📈 Staked ${mint} for ${duration} days. ID: ${stakeId}, Yield: ${estimatedYield.toFixed(2)} SOL`);
  } catch (err: any) {
    await db.insertOne({ userId, action: 'stake', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  }
});

bot.onText(/\/unstakeNFT (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  try {
    const [stakeId] = match![1].split(' ');
    const rateLimitKey = `rate:${userId}`;
    if (await redis.get(rateLimitKey)) throw new Error('Wait 60s between commands');
    await redis.set(rateLimitKey, '1', 'EX', 60);

    const { mint } = await unstakeNFT({ publicKey: msg.text }, stakeId);
    await db.insertOne({ userId, action: 'unstake', stakeId, mint, result: 'success', timestamp: new Date() });
    bot.sendMessage(chatId, `📉 Unstaked ${mint} (ID: ${stakeId})`);
  } catch (err: any) {
    await db.insertOne({ userId, action: 'unstake', result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(chatId, `Error: ${err.message}`);
  });
});

bot.on('message', async (msg) => {
  const wallet = msg.text?.trim();
  const userId = msg.from?.id;
  if (!wallet || wallet.startsWith('/')) return;

  try {
    const rateLimitKey = `rate:${userId}`;
    if (await redis.get(rateLimitKey)) throw new Error('Wait 60s before retrying');
    await redis.set(rateLimitKey, '1', 'EX', 60);

    const pubkey = new PublicKey(wallet);
    const isValid = await verifyNFTWithZKSTARK(pubkey, MINTS); // Use zk-STARK for compressed verification
    await db.insertOne({ wallet, userId, result: isValid ? 'success' : 'fail', timestamp: new Date() });

    bot.sendMessage(msg.chat.id, isValid ? `✅ NFT verified! Join: ${GROUP_LINK}` : `❌ No BARK NFT found.`);
  } catch (err: any) {
    await db.insertOne({ wallet, userId, result: 'fail', error: err.message, timestamp: new Date() });
    bot.sendMessage(msg.chat.id, `⚠️ Invalid wallet or RPC error.`);
  }
});