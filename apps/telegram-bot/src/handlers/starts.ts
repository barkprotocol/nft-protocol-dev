import TelegramBot from 'node-telegram-bot-api'

export function handleStart(bot: TelegramBot, msg: TelegramBot.Message) {
  bot.sendMessage(
    msg.chat.id,
    `🐾 Welcome to BARK!\n\nPlease send your Solana wallet address to verify your NFT ownership.`
  )
}