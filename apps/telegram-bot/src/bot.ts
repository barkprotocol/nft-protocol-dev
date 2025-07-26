import TelegramBot from 'node-telegram-bot-api'
import { Connection, PublicKey } from '@solana/web3.js'
import mongoose from 'mongoose'

const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true })
const connection = new Connection(process.env.SOLANA_RPC_URL!)

mongoose.connect(process.env.MONGODB_URI!)

const checkNftOwnership = async (wallet: string): Promise<boolean> => {
  const publicKey = new PublicKey(wallet)
  const tokens = await connection.getParsedTokenAccountsByOwner(publicKey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXkqDd8QxR3ZfN"),
  })

  const mints = [process.env.BARK_STANDARD_MINT, process.env.BARK_PREMIUM_MINT]
  return tokens.value.some((t) => mints.includes(t.account.data.parsed.info.mint))
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `Welcome to BARK! Please send your wallet address.`)
})

bot.on('message', async (msg) => {
  const wallet = msg.text?.trim()

  if (!wallet || wallet.startsWith('/')) return

  try {
    const isValid = await checkNftOwnership(wallet)
    if (isValid) {
      bot.sendMessage(msg.chat.id, `✅ Verified! Join here: ${process.env.TELEGRAM_GROUP_LINK}`)
    } else {
      bot.sendMessage(msg.chat.id, `❌ You don't own a BARK NFT.`)
    }

    // Log interaction
    await mongoose.connection.collection('verifications').insertOne({
      wallet,
      userId: msg.from?.id,
      timestamp: new Date(),
      result: isValid ? 'success' : 'fail',
    })

  } catch (err) {
    bot.sendMessage(msg.chat.id, `⚠️ Error verifying wallet.`)
  }
})
