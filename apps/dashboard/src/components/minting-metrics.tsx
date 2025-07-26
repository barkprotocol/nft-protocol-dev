import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Metrics {
  total: number;
  premiumPct: number;
  transfers: number;
  savings: number;
  tps: number;
  staked: number;
  avgYield: number;
  activeStakes: number;
  unstaked: number;
  yieldTrend: { date: string; yield: number }[];
  avgStakeDuration: number;
}

export default function MintingMetrics() {
  const { publicKey } = useWallet();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const token = document.querySelector('[data-token]')?.getAttribute('data-token');

  useEffect(() => {
    const fetchMetrics = async () => {
      if (publicKey && token) {
        const res = await fetch('/api/minting-metrics', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setMetrics(await res.json());
      }
    };
    fetchMetrics();
    const id = setInterval(fetchMetrics, 10000);
    return () => clearInterval(id);
  }, [publicKey, token]);

  return (
    <Card className="p-4">
      <CardHeader>
        <CardTitle>Minting & Staking Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        {metrics ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>Minted: {metrics.total}</p>
              <p>Premium: {metrics.premiumPct.toFixed(1)}%</p>
              <p>Transfers: {metrics.transfers}</p>
              <p>Savings: {metrics.savings.toFixed(1)}%</p>
              <p>TPS: {metrics.tps.toFixed(1)}</p>
              <p>Staked: {metrics.staked}</p>
              <p>Avg Yield: {metrics.avgYield.toFixed(3)} SOL</p>
              <p>Active Stakes: {metrics.activeStakes}</p>
              <p>Unstaked: {metrics.unstaked}</p>
              <p>Avg Stake Duration: {metrics.avgStakeDuration.toFixed(1)} days</p>
            </div>
            <h3 className="mt-4 text-lg">Yield Trend (Last 7 Days)</h3>
            <LineChart width={500} height={200} data={metrics.yieldTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="yield" stroke="#8884d8" />
            </LineChart>
          </>
        ) : (
          <p>Loading...</p>
        )}
      </CardContent>
    </Card>
  );
}