import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { MoralisClient } from '../../../../src/moralis-client';
import { blacklistAddresses } from '../../../../src/token-lists';

const MORALIS_API_KEY_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImZmZGYwZWJkLWZlNGYtNGUyMi04MDgwLWVjNzAxZWNmOWJmYyIsIm9yZ0lkIjoiNTA4OTEzIiwidXNlcklkIjoiNTIzNjIyIiwidHlwZUlkIjoiODk0NGNiNzgtZjg3YS00NDZiLTlkYzctMmE4ZjE4ZDk3MzI1IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzU2ODQ0MjUsImV4cCI6NDkzMTQ0NDQyNX0.dgzOA_cu3qjJtRjjwe25O8-MJAkI00uptxklb27wwfI';

const positiveIntFromString = (value: string): number => {
  const intValue = parseInt(value, 10);
  if (isNaN(intValue) || intValue <= 0) throw new Error('Value must be a positive integer');
  return intValue;
};

const requestQuerySchema = z.object({
  chainId: z.string().transform(positiveIntFromString),
  evmAddress: z.string(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const apiKey = process.env.MORALIS_API_KEY || MORALIS_API_KEY_FALLBACK;
    const { chainId, evmAddress } = requestQuerySchema.parse(req.query);
    const supportedChains = MoralisClient.getSupportedChainIds();

    if (!supportedChains.includes(chainId)) {
      return res.status(400).json({
        success: false,
        error: `Chain ID ${chainId} is not supported. Supported: ${supportedChains.join(', ')}`,
      });
    }

    const moralisClient = new MoralisClient(apiKey);
    const response = await moralisClient.fetchTokens(chainId, evmAddress, blacklistAddresses);
    res.status(200).json({ success: true, data: response });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    res.status(500).json({ success: false, error: errorMessage });
  }
}
