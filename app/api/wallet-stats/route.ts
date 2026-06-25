import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWalletScore } from "@/lib/walletScore";

const CACHE     = new Map<string, { data: WalletStats; expiry: number }>();
const CACHE_TTL = 60 * 1000; // 1 dakika (debug için kısa)

export const maxDuration = 55;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface WalletStats {
  address:         string;
  usdcBalance:     string;
  totalTxs:        number;
  activeDays:      number;
  uniqueAddresses: number;
  firstTx:         string;
  firstTxRaw:      string | null;
  lastTx:          string;
  walletScore:     number;
  txS:             number;
  ageS:            number;
  volS:            number;
  conS:            number;
  feeS:            number;
  gasFees:         string;
  arcVolume:       number;
  routisAge:       string;
  cachedAt:        number;
  explorerUrl:     string;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function lastTxAge(iso: string): string {
  if (!iso) return "—";
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);
  if (diffH < 1)  return diffMin <= 1 ? "Just now" : `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 30) return `${diffD}d ago`;
  const months = Math.floor(diffD / 30);
  const rem    = diffD % 30;
  return rem === 0 ? `${months} mo ago` : `${months} mo ${rem}d ago`;
}

function formatRoutisAge(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffD  = Math.floor(diffMs / 86400000);
  if (diffD < 1)   return "Today";
  if (diffD < 30)  return `${diffD} day${diffD > 1 ? "s" : ""}`;
  const months = Math.floor(diffD / 30);
  const years  = Math.floor(months / 12);
  const remMon = months % 12;
  if (years === 0)  return `${months} month${months > 1 ? "s" : ""}`;
  if (remMon === 0) return `${years} year${years > 1 ? "s" : ""}`;
  return `${years}y ${remMon}mo`;
}

async function fetchArcStats(address: string) {
  const rpcUrl     = `https://rpc.testnet.arc.network`;
  const explorerV2 = `https://testnet.arcscan.app/api/v2`;

  // Paralel: RPC (balance + tx count) + ArcScan (transactions + token transfers + ilk tx)
  const [balanceRes, txCountRes, txRes, tokenTransferRes, firstTxRes] = await Promise.all([
    fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 2, jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"] }),
    }),
    fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getTransactionCount", params: [address, "latest"] }),
    }),
    fetch(`${explorerV2}/addresses/${address}/transactions`),
    fetch(`${explorerV2}/addresses/${address}/token-transfers?type=ERC-20`),
    // v1 API ile ilk tx'i çek (sort=asc, offset=1)
    fetch(`https://testnet.arcscan.app/api/v1?module=account&action=txlist&address=${address}&sort=asc&page=1&offset=1`),
  ]);

  const balData  = await balanceRes.json();
  const noncData = await txCountRes.json();

  let txData: { items?: unknown[] } = { items: [] };
  if (txRes.ok) {
    try { txData = await txRes.json(); }
    catch (e) { console.error("[wallet-stats] txRes parse error:", e); }
  } else {
    console.error("[wallet-stats] txRes failed:", txRes.status, await txRes.text().catch(() => ""));
  }

  // İlk tx tarihini v1 API'den al (sort=asc ile gerçek ilk tx)
  let firstTxDateFromV1: string | null = null;
  if (firstTxRes.ok) {
    try {
      const v1Data = await firstTxRes.json();
      const ts = v1Data?.result?.[0]?.timeStamp;
      if (ts) {
        firstTxDateFromV1 = new Date(parseInt(ts, 10) * 1000).toISOString();
      }
    } catch (e) {
      console.error("[wallet-stats] firstTxRes parse error:", e);
    }
  }

  // Token transfer volume (on-chain USDC + EURC gönderilen miktarlar)
  let onchainVolume = 0;
  if (tokenTransferRes.ok) {
    try {
      const ttData = await tokenTransferRes.json();
      const transfers: Array<{
        from?: { hash?: string };
        total?: { value?: string; decimals?: string };
        token?: { symbol?: string };
      }> = ttData.items ?? [];

      // Sadece bu adresin GÖNDERDIĞI transferleri say (double-count önlemek için)
      for (const t of transfers) {
        if (t.from?.hash?.toLowerCase() !== address.toLowerCase()) continue;
        const sym = t.token?.symbol ?? "";
        if (sym !== "USDC" && sym !== "EURC" && sym !== "cirBTC") continue;
        const raw      = BigInt(t.total?.value ?? "0");
        const decimals = parseInt(t.total?.decimals ?? "6", 10);
        onchainVolume += Number(raw) / Math.pow(10, decimals);
      }
    } catch (e) {
      console.error("[wallet-stats] token-transfers parse error:", e);
    }
  }

  const balWei      = balData.result ? BigInt(balData.result) : BigInt(0);
  const usdcBalance = (Number(balWei) / 1e18).toFixed(4);

  // totalTxs = nonce (gerçek gönderilen tx sayısı)
  const totalTxs = noncData.result ? parseInt(noncData.result, 16) : 0;

  const items: Array<{
    timestamp?: string;
    fee?: { value?: string };
    from?: { hash?: string };
    to?: { hash?: string };
  }> = (txData.items ?? []) as Array<{
    timestamp?: string;
    fee?: { value?: string };
    from?: { hash?: string };
    to?: { hash?: string };
  }>;

  // İlk ve son tx tarihleri
  const timestamps = items
    .map((t) => t.timestamp)
    .filter((t): t is string => !!t)
    .sort();
  const firstTxDate = timestamps[0]   ?? null;
  const lastTxDate  = timestamps[timestamps.length - 1] ?? null;

  // Toplam gas fees (fee.value wei cinsinden, USDC = 18 dec)
  const totalGasWei = items.reduce((sum, tx) => {
    const feeVal = tx.fee?.value;
    return sum + (feeVal ? BigInt(feeVal) : BigInt(0));
  }, BigInt(0));
  const gasFees = (Number(totalGasWei) / 1e18).toFixed(6);

  // Active days: kaç farklı günde tx var
  const uniqueDays = new Set(
    items
      .map((t) => t.timestamp?.slice(0, 10))
      .filter(Boolean)
  ).size;

  // Unique addresses interacted with
  const uniqueAddrs = new Set(
    items.flatMap((t) => [t.from?.hash, t.to?.hash].filter(Boolean))
  );
  uniqueAddrs.delete(address.toLowerCase());
  const uniqueAddresses = uniqueAddrs.size;

  return { totalTxs, usdcBalance, firstTxDate: firstTxDateFromV1 ?? firstTxDate, lastTxDate, gasFees, activeDays: uniqueDays, uniqueAddresses, onchainVolume };
}

async function fetchSupabaseStats(address: string) {
  const lower = address.toLowerCase();
  const { data: scores } = await supabase
    .from("user_scores").select("swap_count, volume_usd").eq("address", lower).single();
  const { data: firstSwap } = await supabase
    .from("swap_records").select("created_at").eq("user_address", lower)
    .order("created_at", { ascending: true }).limit(1).single();
  return {
    swapCount:     scores?.swap_count    ?? 0,
    volumeUsd:     scores?.volume_usd    ?? 0,
    firstSwapDate: firstSwap?.created_at ?? null,
  };
}

async function upsertWalletScore(address: string, data: WalletStats) {
  try {
    const walletAgeDays = data.firstTxRaw
      ? Math.floor((Date.now() - new Date(data.firstTxRaw).getTime()) / 86400000)
      : 0;
    const { error } = await supabase.from("wallet_scores").upsert({
      address:          address.toLowerCase(),
      wallet_score:     data.walletScore,
      total_txs:        data.totalTxs,
      wallet_age_days:  walletAgeDays,
      base_volume_usd:  data.arcVolume,
      gas_fees_eth:     data.gasFees,
      unique_addresses: data.uniqueAddresses,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "address" });
    if (error) console.error("[wallet-scores] upsert error:", error.message, error.details, error.hint);
    else console.log("[wallet-scores] upserted:", address.toLowerCase());
  } catch (err) {
    console.error("[wallet-scores] upsert failed:", err);
  }
}

export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get("address") ?? "";
  const address = raw.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const cached = CACHE.get(address);
  if (cached && Date.now() < cached.expiry) {
    void upsertWalletScore(address, cached.data);
    return NextResponse.json(cached.data);
  }

  try {
    const [arcStats, supaStats] = await Promise.all([
      fetchArcStats(address),
      fetchSupabaseStats(address),
    ]);

    const { totalTxs, usdcBalance, firstTxDate, lastTxDate, gasFees, activeDays, uniqueAddresses, onchainVolume } = arcStats;
    const { swapCount, volumeUsd, firstSwapDate } = supaStats;

    // Wallet age — ArcScan'dan firstTxDate, yoksa Supabase'den firstSwapDate
    const firstDateStr = firstTxDate ?? firstSwapDate ?? null;
    const walletAgeMonths = firstDateStr
      ? (Date.now() - new Date(firstDateStr).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0;

    const scoreResult = getWalletScore(
      totalTxs,
      walletAgeMonths,
      onchainVolume,       // Gerçek on-chain volume (ArcScan token transfers)
      activeDays,
      parseFloat(gasFees),
    );

    const data: WalletStats = {
      address,
      usdcBalance,
      totalTxs,
      activeDays,
      uniqueAddresses,
      firstTx:     firstTxDate  ? fmtDate(firstTxDate)  : "—",
      firstTxRaw:  firstDateStr,
      lastTx:      lastTxDate   ? lastTxAge(lastTxDate)  : "—",
      walletScore: scoreResult.finalScore,
      txS:         scoreResult.txS,
      ageS:        scoreResult.ageS,
      volS:        scoreResult.volS,
      conS:        scoreResult.conS,
      feeS:        scoreResult.feeS,
      gasFees,
      arcVolume:   onchainVolume,   // on-chain volume
      routisAge:   formatRoutisAge(firstDateStr),
      cachedAt:    Date.now(),
      explorerUrl: `https://testnet.arcscan.app/address/${address}`,
    };

    CACHE.set(address, { data, expiry: Date.now() + CACHE_TTL });
    await upsertWalletScore(address, data);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[wallet-stats]", err);
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json({ error: (err as Error).message ?? "Failed" }, { status: 500 });
  }
}
