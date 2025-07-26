import TelegramBot from 'node-telegram-bot-api'
import mongoose from 'mongoose'

const ADMINS = (process.env.BOT_ADMINS || '').split(',').map(id => Number(id.trim()))

export function handleStats(bot: TelegramBot) {
  bot.onText(/\/stats/, async (msg) => {
    if (!ADMINS.includes(msg.from?.id || 0)) return

    const success = await mongoose.connection.collection('verifications').countDocuments({ result: 'success' })
    const fail = await mongoose.connection.collection('verifications').countDocuments({ result: 'fail' })

    bot.sendMessage(msg.chat.id, `📊 Stats:\n✅ Verified: ${success}\n❌ Failed: ${fail}`)
  })
}
