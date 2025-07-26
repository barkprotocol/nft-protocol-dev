import TelegramBot, { InlineKeyboardButton } from 'node-telegram-bot-api'
import { checkNftOwnership } from '../utils/solana'
import { isRateLimited } from '../utils/rateLimit'
import mongoose from 'mongoose'

export function handleMessage(bot: TelegramBot) {
  bot.on('message', async (msg) => {
    const userId = msg.from?.id
    const wallet = msg.text?.trim()

    if (!wallet || wallet.startsWith('/') || !userId) return
    if (isRateLimited(userId)) {
      return bot.sendMessage(msg.chat.id, '⏳ Please wait 1 minute before trying again.')
    }

    try {
      const isValid = await checkNftOwnership(wallet)

      if (isValid) {
        bot.sendMessage(msg.chat.id, `✅ Verified!`, {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔗 Join Private Group', url: process.env.TELEGRAM_GROUP_LINK! } as InlineKeyboardButton,
            ]],
          },
        })
      } else {
        bot.sendMessage(msg.chat.id, `❌ No eligible BARK NFT found in that wallet.`)
      }

      await mongoose.connection.collection('verifications').insertOne({
        wallet,
        userId,
        timestamp: new Date(),
        result: isValid ? 'success' : 'fail',
      })

      console.log(`[LOG] ${userId} → ${wallet}: ${isValid ? '✅' : '❌'}`)
    } catch (err) {
      console.error('[ERROR]', err)
      bot.sendMessage(msg.chat.id, `⚠️ Verification failed. Try again later.`)
    }
  })
}
