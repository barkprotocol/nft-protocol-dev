import { expect } from 'chai';
import { createUmi, generateSigner } from '@metaplex-foundation/umi';
import { mintNFT, mintPrivateNFT, transferNFTCrossChain, stakeNFT, unstakeNFT, initializeMerkleTree } from '../app/utils/solana';
import { ethers } from 'ethers';
import mongoose from 'mongoose';
import Redis from 'ioredis';

describe('Devnet Tests', () => {
  const umi = createUmi('https://api.devnet.solana.com');
  const ethProvider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_ENDPOINT);
  const redis = new Redis(process.env.REDIS_URL!);
  let wallet: any, merkleTree: string, ethWallet: ethers.Wallet;
  const db = mongoose.connection.collection('verifications');

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    wallet = generateSigner(umi);
    await umi.rpc.airdrop(wallet.publicKey, 1e9); // 1 SOL
    merkleTree = await initializeMerkleTree(wallet, 1000);
    ethWallet = new ethers.Wallet('your-private-key', ethProvider);
  });

  it('mints 800 standard & 200 premium cNFTs', async () => {
    const start = Date.now();
    const mints = [
      ...Array(800).fill().map(() => mintNFT(wallet, 0, 'valid-token')), // Standard
      ...Array(200).fill().map(() => mintPrivateNFT(wallet, 1, 'valid-token')), // Premium
    ];
    const results = await Promise.allSettled(mints);
    const duration = (Date.now() - start) / 1000;
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const premiumMints = results.slice(800).filter(r => r.status === 'fulfilled').length;
    const cost = successes * 0.0001;
    const storage = (await db.find({ action: 'mint' }).toArray()).length * 256;
    const cacheHits = await redis.info('stats').then(info => parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0'));

    console.log(`Mint: ${successes}/1000, ${premiumMints}/200 premium, TPS: ${(1000/duration).toFixed(1)}, Cost: ${cost.toFixed(4)} SOL, Storage: ${storage} bytes, Cache Hits: ${cacheHits}`);
    expect(successes).to.eq(1000);
    expect(premiumMints).to.eq(200);
    expect(1000/duration).to.be.at.least(100);
    expect(cost).to.be.at.most(0.1);
    expect(storage).to.be.at.most(256 * 1000);
  });

  it('transfers 100 cNFTs to Ethereum', async () => {
    const start = Date.now();
    const mints = (await db.find({ action: 'mint' }).limit(100).toArray()).map(doc => doc.mint);
    const transfers = mints.map(mint => transferNFTCrossChain(mint, wallet, 'ethereum', ethWallet.address));
    const results = await Promise.allSettled(transfers);
    const duration = (Date.now() - start) / 1000;
    const successes = results.filter(r => r.status === 'fulfilled').length;

    console.log(`Transfer: ${successes}/100, Latency: ${(duration/100).toFixed(1)}s, Cost: ${successes * 0.001} SOL + ${successes * 0.01} ETH`);
    expect(successes).to.eq(100);
    expect(duration/100).to.be.at.most(10);
  });

  it('stakes 50 & unstakes 25 cNFTs', async () => {
    const start = Date.now();
    const mints = (await db.find({ action: 'mint' }).limit(50).toArray()).map(doc => doc.mint);
    const stakes = mints.map(mint => stakeNFT(wallet, mint, 30));
    const stakeResults = await Promise.allSettled(stakes);
    const stakeSuccesses = stakeResults.filter(r => r.status === 'fulfilled').length;
    const stakeIds = stakeResults.filter(r => r.status === 'fulfilled').map(r => (r as any).value.stakeId).slice(0, 25);
    const unstakes = stakeIds.map(stakeId => unstakeNFT(wallet, stakeId));
    const unstakeResults = await Promise.allSettled(unstakes);
    const unstakeSuccesses = unstakeResults.filter(r => r.status === 'fulfilled').length;
    const duration = (Date.now() - start) / 1000;
    const yieldAvg = stakeResults.filter(r => r.status === 'fulfilled').reduce((sum, r: any) => sum + r.value.yield, 0) / stakeSuccesses;

    console.log(`Stake: ${stakeSuccesses}/50, Unstake: ${unstakeSuccesses}/25, Latency: ${(duration/75).toFixed(1)}s, Yield: ${yieldAvg.toFixed(3)} SOL`);
    expect(stakeSuccesses).to.eq(50);
    expect(unstakeSuccesses).to.eq(25);
    expect(yieldAvg).to.be.at.least(0.01);
  });
});