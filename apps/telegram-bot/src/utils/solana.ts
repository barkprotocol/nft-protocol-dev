import { Connection, PublicKey } from '@solana/web3.js'

const connection = new Connection(process.env.SOLANA_RPC_URL!)
const MINTS = [
  process.env.BARK_STANDARD_MINT!,
  process.env.BARK_PREMIUM_MINT!,
]

export async function checkNftOwnership(wallet: string): Promise<boolean> {
  const publicKey = new PublicKey(wallet)
  const tokens = await connection.getParsedTokenAccountsByOwner(publicKey, {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXkqDd8QxR3ZfN'),
  })

  return tokens.value.some(t =>
    MINTS.includes(t.account.data.parsed.info.mint)
  )
}
