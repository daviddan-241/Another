/**
 * Jupiter Aggregator swap — used to buy a dust amount of a token so the
 * bot can comment in coins whose chat is locked to holders only.
 *
 * Pipeline:
 *   1. quote(inputMint = SOL, outputMint = tokenMint, amount)
 *   2. swap(quote, userPublicKey) → base64-encoded VersionedTransaction
 *   3. sign with the user's keypair
 *   4. send via Solana RPC
 *
 * Safety:
 *   - Caller passes the SOL amount in lamports; we never invent a number.
 *   - Slippage is configurable (default 8% — needed for volatile new pairs).
 *   - We check the wallet's SOL balance first and refuse if insufficient.
 *   - We use the public Jupiter API (no extra keys required).
 *   - dryRun=true: never signs/sends; returns a fake signature so the
 *     whole AutoChat flow can be exercised end-to-end without SOL spent.
 */
import {
  Connection, Keypair, VersionedTransaction,
  PublicKey, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import axios from "axios";
import { logger } from "./logger";

let DRY_RUN = false;
export function setDryRun(v: boolean): void { DRY_RUN = v; }
export function isDryRun(): boolean { return DRY_RUN; }

const SOL_MINT    = "So11111111111111111111111111111111111111112";
const JUP_QUOTE   = "https://quote-api.jup.ag/v6/quote";
const JUP_SWAP    = "https://quote-api.jup.ag/v6/swap";
const SOLANA_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana.publicnode.com",
  "https://rpc.ankr.com/solana",
];

export interface SwapResult {
  ok: boolean;
  signature?: string;
  inputAmountSol: number;
  estimatedOutputUiAmount?: number;
  error?: string;
}

export async function getSolBalance(privateKey: string): Promise<number> {
  if (DRY_RUN) return 1.234; // fake — never read chain in dry run
  const kp = keypairFromB58(privateKey);
  const conn = await openConnection();
  const lamports = await conn.getBalance(kp.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

function keypairFromB58(b58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(b58.trim()));
}

async function openConnection(): Promise<Connection> {
  for (const rpc of SOLANA_RPCS) {
    try {
      const c = new Connection(rpc, "confirmed");
      // Quick liveness check
      await c.getSlot();
      return c;
    } catch (err) {
      logger.warn({ rpc, err: (err as Error).message }, "RPC unhealthy, trying next");
    }
  }
  // Fall back to first RPC anyway
  return new Connection(SOLANA_RPCS[0], "confirmed");
}

export async function swapSolForToken(opts: {
  privateKey: string;
  tokenMint: string;
  amountSol: number;
  slippageBps?: number;
}): Promise<SwapResult> {
  const kp = keypairFromB58(opts.privateKey);
  const inputAmount = Math.round(opts.amountSol * LAMPORTS_PER_SOL);
  const slippageBps = Math.max(50, Math.min(3000, opts.slippageBps ?? 800)); // 0.5% – 30%

  // ── Balance check ──────────────────────────────────────────────────────────
  const balance = await getSolBalance(opts.privateKey);
  // Need amount + ~0.01 SOL for fees + rent
  const required = opts.amountSol + 0.012;
  if (balance < required) {
    return {
      ok: false,
      inputAmountSol: opts.amountSol,
      error: `Wallet only has ${balance.toFixed(4)} SOL; need ~${required.toFixed(4)} SOL (amount + fees). Top up and try again.`,
    };
  }

  // ── DRY RUN: simulate the whole swap without signing or sending ───────────
  if (DRY_RUN) {
    const fakeSig = bs58.encode(new Uint8Array(64).map(() => Math.floor(Math.random() * 256)));
    logger.info({ mint: opts.tokenMint, solIn: opts.amountSol, dryRun: true }, "[DRY RUN] Would Jupiter-swap");
    return {
      ok: true,
      signature: fakeSig,
      inputAmountSol: opts.amountSol,
      estimatedOutputUiAmount: Math.round(opts.amountSol * 1_000_000), // fake ~1M token units per SOL
    };
  }

  // ── 1. Quote ───────────────────────────────────────────────────────────────
  let quoteRes;
  try {
    quoteRes = await axios.get(JUP_QUOTE, {
      params: {
        inputMint: SOL_MINT,
        outputMint: opts.tokenMint,
        amount: inputAmount,
        slippageBps,
        swapMode: "ExactIn",
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      },
      timeout: 12_000,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return { ok: false, inputAmountSol: opts.amountSol, error: `Jupiter quote failed: ${(err as Error).message}` };
  }

  const quote = quoteRes.data;
  if (!quote?.routePlan?.length) {
    return { ok: false, inputAmountSol: opts.amountSol, error: "No Jupiter route found for this token." };
  }

  // ── 2. Swap transaction ───────────────────────────────────────────────────
  let swapRes;
  try {
    swapRes = await axios.post(JUP_SWAP, {
      quoteResponse: quote,
      userPublicKey: kp.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }, {
      timeout: 15_000,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return { ok: false, inputAmountSol: opts.amountSol, error: `Jupiter swap build failed: ${(err as Error).message}` };
  }

  const swapTxB64 = swapRes.data?.swapTransaction;
  if (!swapTxB64) return { ok: false, inputAmountSol: opts.amountSol, error: "No swapTransaction returned by Jupiter" };

  // ── 3. Sign + send ─────────────────────────────────────────────────────────
  let signature: string;
  try {
    const txBuf = Buffer.from(swapTxB64, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([kp]);
    const conn = await openConnection();
    signature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });
    // Wait for confirmation (up to 60s)
    const conf = await conn.confirmTransaction(signature, "confirmed");
    if (conf.value.err) {
      return { ok: false, inputAmountSol: opts.amountSol, error: `Tx failed on-chain: ${JSON.stringify(conf.value.err)}` };
    }
  } catch (err) {
    return { ok: false, inputAmountSol: opts.amountSol, error: `Swap tx failed: ${(err as Error).message}` };
  }

  logger.info({
    mint: opts.tokenMint,
    solIn: opts.amountSol,
    estimatedOut: quote.outAmount,
    signature: signature.slice(0, 16) + "…",
  }, "Jupiter swap confirmed");

  return {
    ok: true,
    signature,
    inputAmountSol: opts.amountSol,
    estimatedOutputUiAmount: Number(quote.outAmount) / 1e6, // most pump.fun tokens are 6 decimals
  };
}

/**
 * Returns the pump.fun token's mint from a coin mint address.
 * Currently a passthrough — pump.fun tokens use their mint as the swap target.
 */
export function tokenMintForCoin(coinMint: string): string {
  return new PublicKey(coinMint).toBase58();
}
