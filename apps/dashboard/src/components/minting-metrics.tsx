import { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
const db = mongoose.connection.collection('verifications');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { wallet } = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (!(process.env.NEXT_PUBLIC_ADMIN_WALLETS || '').split(',').includes(wallet)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const cacheKey = `minting:${wallet}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, premiumMinted, transfers, staked, avgYield, activeStakes, unstaked, txCount, duration, yieldTrend, avgStakeDuration] = await Promise.all([
      db.countDocuments({ action: 'mint' }),
      db.countDocuments({ action: 'mint', private: true }),
      db.countDocuments({ action: 'transfer' }),
      db.countDocuments({ action: 'stakeNFT' }),
      db.find({ action: 'stakeNFT', result: 'success' }).toArray().then(docs => docs.reduce((sum, doc) => sum + (doc.yield || 0), 0) / (docs.length || 1)),
      db.countDocuments({ action: 'stakeNFT', result: 'success', timestamp: { $gte: sevenDaysAgo } }),
      db.countDocuments({ action: 'unstakeNFT' }),
      db.countDocuments({ timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }),
      db.find({ timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }).toArray()
        .then(docs => docs.length ? (new Date().getTime() - new Date(docs[docs.length - 1].timestamp).getTime()) / 1000 : 0),
      db.find({ action: 'stakeNFT', result: 'success', timestamp: { $gte: sevenDaysAgo } })
        .toArray()
        .then(docs => {
          const dailyYields: { [key: string]: number[] } = {};
          docs.forEach(doc => {
            const date = new Date(doc.timestamp).toISOString().split('T')[0];
            dailyYields[date] = dailyYields[date] ? [...dailyYields[date], doc.yield] : [doc.yield];
          });
          return Object.entries(dailyYields).map(([date, yields]) => ({
            date,
            yield: yields.reduce((sum, y) => sum + y, 0) / (yields.length || 1),
          }));
        }),
      db.find({ action: 'stakeNFT', result: 'success' }).toArray().then(docs => docs.reduce((sum, doc) => sum + (doc.duration || 0), 0) / (docs.length || 1)),
    ]);

    const result = {
      total,
      premiumPct: total ? (premiumMinted / total) * 100 : 0,
      transfers,
      savings: 99,
      tps: duration > 0 ? txCount / duration : 0,
      staked,
      avgYield,
      activeStakes,
      unstaked,
      yieldTrend,
      avgStakeDuration,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
}