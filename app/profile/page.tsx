"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/supabase";
import { arcTestnet, ARC_TOKENS, SWAP_TOKENS } from "@/lib/arc-kit";
import { useNFTTier } from "@/hooks/useNFTTier";
import { TIER_ICONS } from "@/constants/nft-tiers";

/* ── Types ────────────────────────────────────────────────── */
interface UserScore {
  swap_count: number;
  volume_usd: number;
  updated_at: string;
}

interface SwapRecord {
  id:         string;
  token_in:   string;
  token_out:  string;
  amount_in:  string;
  amount_out: string;
  tx_hash:    string;
  created_at: string;
}

interface TokenRow {
  symbol:  string;
  name:    string;
  logoUrl: string;
  balance: number;
  price:   number;
  usdVal:  number;
  pct:     number;
}

/* ── Helpers ──────────────────────────────────────────────── */
function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/* ── Page ─────────────────────────────────────────────────── */
export default function ProfilePage() {
  const { address } = useAccount();
  const [tab, setTab] = useState<"portfolio" | "history" | "referral">("portfolio");
  const { mintedTiers } = useNFTTier(address);

  /* on-chain balance */
  const { data: nativeBal } = useBalance({ address, chainId: arcTestnet.id });
  const nativeFloat = nativeBal ? Number(nativeBal.value) / Math.pow(10, nativeBal.decimals) : 0;

  /* supabase data */
  const [score,   setScore]   = useState<UserScore | null>(null);
  const [history, setHistory] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const HIST_PAGE_SIZE = 5;

  /* token prices */
  const [prices,   setPrices]   = useState<Record<string, number>>({ USDC: 1, EURC: 1.08, cirBTC: 100000, NATIVE: 1 });
  const [tokensUI, setTokensUI] = useState<TokenRow[]>([]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    Promise.all([
      supabase.from("user_scores").select("*").eq("address", address.toLowerCase()).single(),
      supabase.from("swap_records").select("*").eq("user_address", address.toLowerCase()).order("created_at", { ascending: false }).limit(100),
      fetch("/api/token-price?symbol=EURC").then(r => r.json()).catch(() => ({ price: 1.08 })),
      fetch("/api/token-price?symbol=cirBTC").then(r => r.json()).catch(() => ({ price: 100000 })),
    ]).then(([scoreRes, histRes, eurc, cbtc]) => {
      setScore(scoreRes.data);
      setHistory(histRes.data ?? []);
      setPrices({ USDC: 1, NATIVE: 1, EURC: eurc.price, cirBTC: cbtc.price });
      setLoading(false);
    });
  }, [address]);

  /* build token rows from on-chain balance */
  useEffect(() => {
    if (!address) return;
    const displayTokens = ARC_TOKENS.filter(t => t.symbol !== "NATIVE");
    const rows: TokenRow[] = displayTokens.map(t => {
      // On Arc Testnet, native balance = USDC (18 dec)
      const bal   = t.symbol === "USDC" ? nativeFloat : 0;
      const price = prices[t.symbol] ?? 1;
      return { symbol: t.symbol, name: t.name, logoUrl: t.logoUrl, balance: bal, price, usdVal: bal * price, pct: 0 };
    }).filter(r => r.balance > 0);

    const total = rows.reduce((s, r) => s + r.usdVal, 0);
    const withPct = rows.map(r => ({ ...r, pct: total > 0 ? (r.usdVal / total) * 100 : 0 }));
    setTokensUI(withPct);
  }, [address, nativeFloat, prices]);

  const totalUsd = tokensUI.reduce((s, r) => s + r.usdVal, 0);

  /* referral link */
  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : "https://arc-aggregator.xyz"}/swap?ref=${address.slice(2, 10)}`
    : "";

  /* ── Render ──────────────────────────────────────────────── */
  if (!address) {
    return (
      <>
        <Header />
        <main className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-4 pb-24">
          <div className="text-center">
            <div className="text-5xl mb-4">👤</div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Connect your wallet to view your profile
            </p>
          </div>
        </main>
        <MobileNav />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex min-h-[calc(100vh-56px)] flex-col items-center px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-xl">

          {/* ── Avatar + address card ── */}
          <div
            className="rounded-2xl border p-6 mb-4 flex flex-col items-center gap-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
              style={{ background: "var(--bg-input)", border: "2px solid var(--border)" }}
            >
              👤
            </div>

            {/* Full address */}
            <p className="font-mono text-sm break-all text-center" style={{ color: "var(--text-primary)" }}>
              {address}
            </p>

            {/* Rank badge */}
            {(() => {
              const highestBadge = [...mintedTiers].filter(t => t.minted).sort((a, b) => b.requiredScore - a.requiredScore)[0];
              return (
                <div
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: highestBadge ? highestBadge.color + "88" : "var(--border)",
                    color:       highestBadge ? highestBadge.color : "var(--text-secondary)",
                    background:  highestBadge ? highestBadge.color + "18" : "var(--bg-input)",
                  }}
                >
                  {highestBadge
                    ? <>{TIER_ICONS[highestBadge.name]} {highestBadge.name}</>
                    : <span style={{ color: "var(--text-secondary)" }}>— Unranked</span>
                  }
                </div>
              );
            })()}
          </div>

          {/* ── Tab switcher ── */}
          <div
            className="flex gap-1 rounded-2xl border p-1 mb-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            {(["portfolio", "history", "referral"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-all"
                style={{
                  background: tab === t ? "var(--accent-orange)" : "transparent",
                  color:      tab === t ? "#fff" : "var(--text-secondary)",
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Portfolio tab ── */}
          {tab === "portfolio" && (
            <div
              className="rounded-2xl border p-4"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {loading ? (
                <div className="flex justify-center py-8"><LoadingSpinner size={24} /></div>
              ) : (
                <>
                  {/* Total balance header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: "var(--text-secondary)" }}>
                        TOTAL BALANCE
                      </p>
                      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                        ${totalUsd.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>24h Change</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--accent-green)" }}>+$0.00 (24h)</p>
                    </div>
                  </div>

                  {/* Token rows */}
                  {tokensUI.length === 0 ? (
                    <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                      No token balance found. Get testnet tokens from the{" "}
                      <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer"
                        className="underline" style={{ color: "var(--accent-orange)" }}>
                        Circle Faucet
                      </a>.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tokensUI.map(row => (
                        <div key={row.symbol} className="rounded-xl border p-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                          {/* Top row */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.logoUrl} alt={row.symbol} width={28} height={28} className="rounded-full"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              <div>
                                <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{row.symbol}</span>
                                <span className="text-xs ml-1.5" style={{ color: "var(--text-secondary)" }}>{row.name}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                                ${row.usdVal.toFixed(2)}
                              </p>
                              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                                @${row.price.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 rounded-full mb-1 overflow-hidden" style={{ background: "var(--border)" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${row.pct}%`, background: "linear-gradient(90deg,#C9693A,#B55A2E)" }}
                            />
                          </div>

                          {/* Bottom row */}
                          <div className="flex justify-between">
                            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              {row.balance.toFixed(4)} {row.symbol}
                            </span>
                            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              {row.pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── History tab ── */}
          {tab === "history" && (
            <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              {loading ? (
                <div className="flex justify-center py-8"><LoadingSpinner size={24} /></div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div className="text-3xl mb-2">📋</div>
                  No swap history yet.
                </div>
              ) : (() => {
                const totalPages = Math.max(1, Math.ceil(history.length / HIST_PAGE_SIZE));
                const safePage   = Math.min(histPage, totalPages);
                const pageItems  = history.slice((safePage - 1) * HIST_PAGE_SIZE, safePage * HIST_PAGE_SIZE);

                function pageNumbers(): (number | "…")[] {
                  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
                  const pages: (number | "…")[] = [1];
                  if (safePage > 3) pages.push("…");
                  for (let p = Math.max(2, safePage - 1); p <= Math.min(totalPages - 1, safePage + 1); p++) pages.push(p);
                  if (safePage < totalPages - 2) pages.push("…");
                  pages.push(totalPages);
                  return pages;
                }

                return (
                  <>
                    {/* Header */}
                    <div className="grid px-4 py-2.5 border-b text-[10px] font-bold tracking-widest uppercase"
                      style={{ gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                      <span>Transaction</span>
                      <span className="text-center">PTS</span>
                      <span className="text-center">Time</span>
                      <span className="text-right">Status</span>
                    </div>

                    {pageItems.map(h => {
                      const tokenInInfo  = SWAP_TOKENS.find(t => t.symbol === h.token_in);
                      const tokenOutInfo = SWAP_TOKENS.find(t => t.symbol === h.token_out);
                      const date         = new Date(h.created_at);
                      const now          = Date.now();
                      const diffMs       = now - date.getTime();
                      const diffMin      = Math.floor(diffMs / 60_000);
                      const diffH        = Math.floor(diffMs / 3_600_000);
                      const diffD        = Math.floor(diffMs / 86_400_000);
                      const ago          = diffMin < 60 ? `${diffMin}m ago` : diffH < 24 ? `${diffH}h ago` : `${diffD}d ago`;
                      const dateStr      = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
                      const explorerUrl  = h.tx_hash ? `https://testnet.arcscan.app/tx/${h.tx_hash}` : null;

                      return (
                        <div key={h.id} className="grid items-center px-4 py-3 border-b transition-all"
                          style={{ gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr", borderColor: "var(--border)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-input)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div className="flex items-center">
                            <div className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                              {tokenInInfo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={tokenInInfo.logoUrl} alt={h.token_in} width={20} height={20} className="rounded-full"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              )}
                              <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{h.token_in}</span>
                              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>→</span>
                              {tokenOutInfo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={tokenOutInfo.logoUrl} alt={h.token_out} width={20} height={20} className="rounded-full"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              )}
                              <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{h.token_out}</span>
                            </div>
                          </div>
                          <div className="text-center text-sm font-bold" style={{ color: "#C9693A" }}>+100</div>
                          <div className="text-center">
                            <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{ago}</div>
                            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{dateStr}</div>
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ background: "#16a34a22", color: "#16a34a" }}>
                              ✓ Completed
                            </span>
                            {explorerUrl && (
                              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                                className="transition-opacity hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-1 px-4 py-3 flex-wrap">
                        <button onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
                          style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-secondary)" }}>
                          ← Prev
                        </button>
                        {pageNumbers().map((p, idx) =>
                          p === "…" ? (
                            <span key={`e-${idx}`} className="px-1 text-sm" style={{ color: "var(--text-secondary)" }}>…</span>
                          ) : (
                            <button key={p} onClick={() => setHistPage(p as number)}
                              className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all"
                              style={p === safePage
                                ? { background: "#C9693A", borderColor: "#C9693A", color: "#fff" }
                                : { borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-secondary)" }}>
                              {p}
                            </button>
                          )
                        )}
                        <button onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40"
                          style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-secondary)" }}>
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Referral tab ── */}
          {tab === "referral" && (
            <div className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div>
                <p className="font-bold text-sm mb-1" style={{ color: "var(--text-primary)" }}>Your Referral Link</p>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  Share your referral link and earn bonus points when friends swap on Arc Aggregator.
                </p>
                <div className="flex gap-2">
                  <div
                    className="flex-1 rounded-xl border px-3 py-2.5 text-xs font-mono truncate"
                    style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {referralLink}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(referralLink); }}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold transition-all hover:brightness-110"
                    style={{ background: "linear-gradient(90deg,#C9693A,#B55A2E)", color: "#fff" }}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="rounded-xl border p-4 grid grid-cols-2 gap-4"
                style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                {[
                  { label: "Total Referrals", value: "0" },
                  { label: "Bonus Points",    value: "0 pts" },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>{item.label}</p>
                    <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Referral rewards are tracked on-chain and credited automatically after each successful swap.
              </div>
            </div>
          )}

        </div>
      </main>
      <MobileNav />
    </>
  );
}
