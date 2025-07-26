# BARK NFT Protocol

The BARK NFT Protocol enables exclusive access to a private Telegram community through the minting of Solana-based NFTs. It includes a **Next.js minting portal**, a **Telegram verification bot**, and an **Admin Dashboard** for analytics and moderation.

---

## 🧩 System Components

### 1. **Minting Portal (Next.js)**

* Mint Standard or Premium BARK NFTs.
* Connect Solana wallets (Phantom, Solflare, Backpack).
* Show minting progress per collection.
* Countdown to mint end time.

### 2. **Telegram Bot (@BARKNFTBot)**

* Validates Solana wallet ownership of a BARK NFT.
* Sends invite link if the user owns at least 1 Standard or Premium NFT.
* Logs all interactions to MongoDB.

### 3. **Admin Dashboard**

* View wallet verification logs.
* Monitor minted NFT counts.
* Filter by date, mint type, and outcome.

---

## 🚀 Getting Started

### Prerequisites

* Node.js 20+
* MongoDB (e.g., Atlas cluster) or Neon (Postgres)
* Vercel + Render accounts
* Phantom/Solflare Wallet

---

## 🔧 Setup Instructions

### Monorepo

Install [pnpm](https://pnpm.io):

```bash
npm install -g pnpm
```

Install all packages:

```bash
pnpm install
```

Each package lives in:

```
/apps/minting-portal
/apps/telegram-bot
/apps/dashboard
```

---

## 📦 App: Minting Portal (`apps/minting-portal`)

### Setup

```bash
cd apps/minting-portal
pnpm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_BARK_STANDARD_MINT=<STANDARD_MINT_ADDRESS>
NEXT_PUBLIC_BARK_PREMIUM_MINT=<PREMIUM_MINT_ADDRESS>
NEXT_PUBLIC_BARK_STANDARD_SUPPLY=1000
NEXT_PUBLIC_BARK_PREMIUM_SUPPLY=500
```

Run:

```bash
pnpm run dev
```

Deploy to Vercel:

```bash
vercel --prod
```

---

## 🤖 App: Telegram Bot (`apps/telegram-bot`)

### Setup

```bash
cd apps/telegram-bot
pnpm install
```

Create `.env`:

```env
BOT_TOKEN=<TELEGRAM_BOT_TOKEN>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
BARK_STANDARD_MINT=<STANDARD_MINT_ADDRESS>
BARK_PREMIUM_MINT=<PREMIUM_MINT_ADDRESS>
TELEGRAM_GROUP_LINK=https://t.me/your_group
MONGODB_URI=<MONGODB_URI>
```

Run:

```bash
pnpm start
```

Deploy to Render (set env vars via dashboard).

---

## 🧑‍💼 App: Admin Dashboard (`apps/dashboard`)

### Setup

```bash
cd apps/dashboard
pnpm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_BARK_STANDARD_MINT=<STANDARD_MINT_ADDRESS>
NEXT_PUBLIC_BARK_PREMIUM_MINT=<PREMIUM_MINT_ADDRESS>
MONGODB_URI=<MONGODB_URI>
NEXT_PUBLIC_ADMIN_WALLETS=<wallet1,wallet2,...>
```

Run:

```bash
pnpm run dev
```

Deploy to Vercel:

```bash
vercel --prod
```

---

## 👥 User Instructions

1. **Mint NFT**: Go to the [minting portal](https://bark-minting-portal.vercel.app), connect your wallet, and mint a Standard or Premium NFT.
2. **Verify Ownership**: Send your wallet address to the bot [@BARKNFTBot](https://t.me/BARKNFTBot).
3. **Join the Community**: If verified, you'll receive a Telegram invite link.

---

## 🧠 Developer Notes

* Minting limited to 1 NFT per collection per wallet.
* Mints are tracked using on-chain token account data.
* Verification checks wallet’s token accounts for presence of eligible mints.
* Minting fees are paid in SOL and sent to a configurable address.

---

## ✅ Security & Abuse Prevention

* Telegram bot includes wallet validation.
* MongoDB stores all verification attempts with user IDs and timestamps.
* Prevent duplicate mints via token account checks.
* Rate limiting to be implemented in the next update.

---

## 🛠 To Do (Next Milestones)

* Add CAPTCHA to mint portal
* Rate limiting on bot
* Admin dashboard filters (date, success/failure)
* NFT metadata rarity traits
* Firebase push notifications for new mints (optional)

---

## 📫 Support

Join the BARK community on Telegram @bark\_protocol or reach out via [support@barkprotocol.net](mailto:support@barkprotocol.net) for assistance.

---

## 📄 License

MIT License. Copyright (c) 2025 BARK Protocol
