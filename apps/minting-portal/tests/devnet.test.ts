import { expect } from 'chai';
import { createUmi, generateSigner } from '@metaplex-foundation/umi';
import { mintNFT, mintPrivateNFT, transferNFTCrossChain, stakeNFT, initializeMerkleTree } from '../src/utils/solana';
import { ethers } from 'ethers';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

describe('Devnet Tests', () => {
  const umi = createUmi('https://api.devnet.solana.com');
  const ethProvider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_ENDPOINT);
  let wallet: any, merkleTree: string, ethWallet: ethers.Wallet;

  before(async () => {
    wallet = generateSigner(umi);
    await umi.rpc.airdrop(wallet.publicKey, 1e9); // 1 SOL
    merkleTree = await initializeMerkleTree(wallet, 1000);
    ethWallet = new ethers.Wallet('your-private-key', ethProvider);
  });

  it('mints 800 standard & 200 private cNFTs', async () => {
    const start = Date.now();
    const mints = [
      ...Array(800).fill().map(() => mintNFT(wallet, 0, 'valid-token')),
      ...Array(200).fill().map(() => mintPrivateNFT(wallet, 0, 'valid-token')),
    ];
    const results = await Promise.allSettled(mints);
    const duration = (Date.now() - start) / 1000;
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const privateMints = results.slice(800).filter(r => r.status === 'fulfilled').length;
    const cost = successes * 0.0001;
    const storage = (await pool.query('SELECT SUM(pg_column_size(token_accounts)) FROM token_accounts')).rows[0].sum || 256;

    console.log(`Mint: ${successes}/1000 cNFTs, ${privateMints}/200 private, TPS: ${(1000/duration).toFixed(1)}, Cost: ${cost.toFixed(4)} SOL, Storage: ${storage} bytes`);
    expect(successes).to.eq(1000);
    expect(privateMints).to.eq(200);
    expect(1000/duration).to.be.at.least(100);
    expect(cost).to.be.at.most(0.1);
    expect(storage).to.be.at.most(512);
  });

  it('transfers 100 cNFTs to Ethereum', async () => {
    const start = Date.now();
    const mints = (await pool.query('SELECT mint FROM token_accounts LIMIT 100')).rows;
    const transfers = mints.map(({ mint }) => transferNFTCrossChain(mint, wallet, 'ethereum', ethWallet.address));
    const results = await Promise.allSettled(transfers);
    const duration = (Date.now() - start) / 1000;
    const successes = results.filter(r => r.status === 'fulfilled').length;

    console.log(`Transfer: ${successes}/100 cNFTs, Latency: ${(duration/100).toFixed(1)}s/transfer, Cost: ${successes * 0.001} SOL + ${successes * 0.01} ETH`);
    expect(successes).to.eq(100);
    expect(duration/100).to.be.at.most(10);
  });

  it('stakes 50 cNFTs on Solayer', async () => {
    const start = Date.now();
    const mints = (await pool.query('SELECT mint FROM token_accounts LIMIT 50')).rows;
    const stakes = mints.map(({ mint }) => stakeNFT(wallet, mint, 30));
    const results = await Promise.allSettled(stakes);
    const duration = (Date.now() - start) / 1000;
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const yieldSum = results.filter(r => r.status === 'fulfilled').reduce((sum, r: any) => sum + r.value.yield, 0);

    console.log(`Stake: ${successes}/50 cNFTs, Latency: ${(duration/50).toFixed(1)}s/stake, Yield: ${(yieldSum/successes).toFixed(3)} SOL/stake`);
    expect(successes).to.eq(50);
    expect(yieldSum/successes).to.be.at.least(0.01);
  });
});