import TelegramBot from 'node-telegram-bot-api'
import mongoose from 'mongoose'
import { handleStart } from './handlers/start'
import { handleStats } from './handlers/stats'
import { handleMessage } from './handlers/message'

export function initBot() {
  const bot = new TelegramBot(process.env.BOT_TOKEN!, { polling: true })

  mongoose.connect(process.env.MONGODB_URI!).then(() => {
    console.log('[DB] Connected to MongoDB')
  })

  handleStart(bot)
  handleStats(bot)
  handleMessage(bot)
}
