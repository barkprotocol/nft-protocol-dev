import Redis from 'ioredis';
import { PublicKey } from '@solana/web3.js';
import { Lambda } from 'aws-sdk';

const redis = new Redis(process.env.REDIS_URL!);
const lambda = new Lambda({ region: process.env.AWS_REGION || 'us-east-1' });

interface ZKProof {
  proof: Buffer;
  publicSignals: any[];
}

interface ProofOptions {
  private?: boolean;
  batchSize?: number;
  compress?: boolean;
}

export async function generateZKSTARK(metadata: any, leafOwner: string, options: ProofOptions = {}): Promise<ZKProof> {
  const cacheKey = `zkstark:${JSON.stringify({ metadata, leafOwner })}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const payload = {
      metadata,
      leafOwner,
      private: options.private ?? false,
      batchSize: options.batchSize ?? 50,
      compress: options.compress ?? true,
    };

    const response = await lambda
      .invoke({
        FunctionName: 'zkSTARKGenerator',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      })
      .promise();

    if (response.StatusCode !== 200) throw new Error('Lambda invocation failed');
    const proof: ZKProof = JSON.parse(response.Payload as string);
    if (proof.proof.length > 500) throw new Error('Proof size exceeds 500 bytes');

    await redis.set(cacheKey, JSON.stringify(proof), 'EX', 48 * 3600);
    return proof;
  } catch (err) {
    throw new Error(`ZK-STARK generation failed: ${err.message}`);
  }
}

export async function verifyZKSTARK(compressedState: any, data: { mint: string; pubkey: PublicKey }): Promise<boolean> {
  const cacheKey = `zkstark_verify:${data.mint}:${data.pubkey.toString()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached === 'true';

  try {
    const payload = {
      compressedState,
      mint: data.mint,
      pubkey: data.pubkey.toString(),
    };

    const response = await lambda
      .invoke({
        FunctionName: 'zkSTARKVerifier',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload),
      })
      .promise();

    if (response.StatusCode !== 200) throw new Error('Lambda verification failed');
    const isValid: boolean = JSON.parse(response.Payload as string);

    await redis.set(cacheKey, isValid.toString(), 'EX', 48 * 3600);
    return isValid;
  } catch (err) {
    console.error(`ZK-STARK verification failed: ${err.message}`);
    return false;
  }
}