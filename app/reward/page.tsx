"use client";

import { useState, useEffect } from "react";
import { useAccount }         from "wagmi";
import { ConnectButton }      from "@rainbow-me/rainbowkit";
import { toast }              from "sonner";
import { Header }             from "@/components/layout/Header";
import { MobileNav }          from "@/components/layout/MobileNav";
import { LoadingSpinner }     from "@/components/ui/LoadingSpinner";
import { useNFTTier }         from "@/hooks/useNFTTier";
import { supabase }           from "@/lib/supabase";
import { NFT_TIERS, TIER_ICONS } from "@/constants/nft-tiers";

/* ── Supabase helpers ─────────────────────────────────────── */
async function getMintedTiers(address: string): Promise<Set<number>> {
  const { data } = await supabase
    .from("user_scores")
    .select("minted_tiers")
    .eq("address", address.toLowerCase())
    .single();
  const arr: number[] = data?.minted_tiers ?? [];
  return new Set(arr);
}

async function addMintScore(address: string, tierId: number) {
  // Upsert minted_tiers array and add 100 pts
  const { data } = await supabase
    .from("user_scores")
    .select("score, minted_tiers")
    .eq("address", address.toLowerCase())
    .single();

  const currentScore  = data?.score ?? 0;
  const currentMinted: number[] = data?.minted_tiers ?? [];
  if (currentMinted.includes(tierId)) throw new Error("Already minted");

  await supabase.from("user_scores").upsert({
    address:      address.toLowerCase(),
    score:        currentScore + 100,
    minted_tiers: [...currentMinted, tierId],
    updated_at:   new Date().toISOString(),
  }, { onConflict: "address" });
}

async function hasXFollowReward(address: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_scores")
    .select("x_follow_claimed")
    .eq("address", address.toLowerCase())
    .single();
  return data?.x_follow_claimed ?? false;
}

async function markXFollowReward(address: string) {
  const { data } = await supabase
    .from("user_scores")
    .select("score, x_follow_claimed")
    .eq("address", address.toLowerCase())
    .single();

  // Guard: already claimed
  if (data?.x_follow_claimed) throw new Error("Already claimed");

  const currentScore = data?.score ?? 0;
  await supabase.from("user_scores").upsert({
    address:          address.toLowerCase(),
    score:            currentScore + 1000,
    x_follow_claimed: true,
    updated_at:       new Date().toISOString(),
  }, { onConflict: "address" });
}

/* ── Task row ─────────────────────────────────────────────── */
function TaskRow({ icon, title, desc, pts }: {
  icon:  React.ReactNode;
  title: string;
  desc:  string;
  pts:   number;
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#C9693A")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "#C9693A18" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{desc}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="rounded-full px-3 py-1.5 text-xs font-bold"
          style={{ background: "#C9693A15", color: "#C9693A" }}>
          +{pts}
        </span>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function RewardPage() {
  const { address } = useAccount();
  const { score, refetchMinted } = useNFTTier(address);

  const [mintingTier, setMintingTier] = useState<number | null>(null);
  const [mintedSet,   setMintedSet]   = useState<Set<number>>(new Set());

  const loadMinted = async (addr: string) => {
    const s = await getMintedTiers(addr);
    setMintedSet(s);
  };

  useEffect(() => {
    if (address) loadMinted(address);
    else setMintedSet(new Set());
  }, [address]);

  /* X follow */
  const [xFollowState,    setXFollowState]    = useState<"idle" | "countdown" | "done">("idle");
  const [xCountdown,      setXCountdown]      = useState(10);
  const [xAlreadyClaimed, setXAlreadyClaimed] = useState(false);

  useEffect(() => {
    if (!address) return;
    hasXFollowReward(address).then(claimed => {
      if (claimed) { setXFollowState("done"); setXAlreadyClaimed(true); }
    });
  }, [address]);

  async function handleXFollow() {
    if (!address) { toast.error("Connect your wallet first"); return; }
    if (xFollowState !== "idle" || xAlreadyClaimed) return;

    // Double-check Supabase before starting — prevent farm
    const alreadyClaimed = await hasXFollowReward(address);
    if (alreadyClaimed) {
      setXFollowState("done");
      setXAlreadyClaimed(true);
      toast.info("You already claimed this reward.");
      return;
    }

    window.open("https://x.com/dexar_app", "_blank");
    setXFollowState("countdown");
    setXCountdown(10);
    const interval = setInterval(() => {
      setXCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    setTimeout(async () => {
      try {
        // Check once more before awarding (race condition guard)
        const stillFresh = !(await hasXFollowReward(address));
        if (!stillFresh) {
          setXFollowState("done");
          setXAlreadyClaimed(true);
          toast.info("Reward already claimed.");
          return;
        }
        await markXFollowReward(address);
        setXFollowState("done");
        setXAlreadyClaimed(true);
        toast.success("+1000 points! Thanks for following on X 🎉");
        if (address) await loadMinted(address);
      } catch {
        toast.error("Failed to award points — try again");
        setXFollowState("idle");
      }
    }, 10_000);
  }

  async function handleMint(tierId: number) {
    if (!address) return;
    if (mintedSet.has(tierId)) return;
    setMintingTier(tierId);
    try {
      toast.loading(`Claiming ${NFT_TIERS[tierId].name} badge...`, { id: "mint" });
      await addMintScore(address, tierId);
      await loadMinted(address);
      refetchMinted();
      toast.success(`${NFT_TIERS[tierId].name} badge claimed! +100 points`, { id: "mint" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(`Failed: ${msg}`, { id: "mint" });
    } finally {
      setMintingTier(null);
    }
  }

  const resolvedTiers = NFT_TIERS.map(t => ({
    ...t,
    minted:   mintedSet.has(t.id),
    unlocked: score >= t.requiredScore,
  }));

  const nextTier  = NFT_TIERS.find(t => score < t.requiredScore) ?? null;
  const ptsToNext = nextTier ? nextTier.requiredScore - score : 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 py-6 pb-24 md:pb-10">

        {/* ── Main card ── */}
        <div className="rounded-3xl border px-6 pt-5 pb-4 mb-5"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

          {/* Score row */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Dexar Score</p>
              <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {score.toLocaleString("en-US")}{" "}
                <span className="text-lg font-semibold" style={{ color: "var(--text-secondary)" }}>pts</span>
              </p>
            </div>
            {nextTier && address && (
              <div className="text-right">
                <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Next reward</p>
                <p className="text-sm font-bold" style={{ color: "#C9693A" }}>
                  {ptsToNext.toLocaleString("en-US")} pts to {nextTier.name}
                </p>
              </div>
            )}
          </div>

          {/* ── Progress stepper ── birebir Routis */}
          <div className="grid grid-cols-4 mb-4">
            {NFT_TIERS.map((tier, i) => {
              const isActive = score >= tier.requiredScore;
              const isLast   = i === NFT_TIERS.length - 1;
              const isFirst  = i === 0;
              const nextUnlocked = !isLast && score >= NFT_TIERS[i + 1].requiredScore;
              return (
                <div key={tier.id} className="flex flex-col items-center">
                  {/* Line + icon row */}
                  <div className="flex items-center w-full">
                    {/* Left line */}
                    <div className="flex-1 h-0.5 rounded-full"
                      style={{ background: !isFirst && isActive ? "#C9693A" : !isFirst ? "var(--border)" : "transparent" }}
                    />
                    {/* Icon */}
                    <div
                      className="flex items-center justify-center rounded-xl transition-all shrink-0"
                      style={{
                        width: 48, height: 48, fontSize: 22,
                        background: "var(--bg-input)",
                        border: `2px solid ${isActive ? "#C9693A" : "var(--border)"}`,
                        opacity: isActive ? 1 : 0.55,
                      }}
                    >
                      {TIER_ICONS[tier.name]}
                    </div>
                    {/* Right line */}
                    <div className="flex-1 h-0.5 rounded-full"
                      style={{ background: !isLast && nextUnlocked ? "#C9693A" : !isLast ? "var(--border)" : "transparent" }}
                    />
                  </div>
                  {/* Label */}
                  <span className="text-[11px] sm:text-xs font-bold mt-2"
                    style={{ color: isActive ? "#C9693A" : "var(--text-secondary)" }}>
                    {tier.name}
                  </span>
                  <span className="text-[10px]"
                    style={{ color: isActive ? "#C9693A" : "var(--text-secondary)" }}>
                    {tier.requiredScore.toLocaleString("en-US")} pts
                  </span>
                </div>
              );
            })}
          </div>

          {/* Mint / Owned / Locked buttons */}
          {address && (
            <div className="grid grid-cols-4 gap-2">
              {resolvedTiers.map(tier => {
                const isMinting = mintingTier === tier.id;
                if (tier.minted) {
                  return (
                    <div key={tier.id}
                      className="rounded-xl py-3 text-center text-xs font-bold border"
                      style={{ borderColor: "#C9693A55", color: "#C9693A", background: "#C9693A10" }}>
                      Owned ✓
                    </div>
                  );
                }
                if (tier.unlocked) {
                  return (
                    <button key={tier.id}
                      onClick={() => handleMint(tier.id)}
                      disabled={isMinting}
                      className="rounded-xl py-3 text-xs font-bold border-2 transition-all hover:bg-[#C9693A] hover:text-white disabled:opacity-50"
                      style={{ borderColor: "#C9693A", color: "#C9693A" }}>
                      {isMinting ? <LoadingSpinner size={11} color="#C9693A" /> : "Mint"}
                    </button>
                  );
                }
                return (
                  <div key={tier.id}
                    className="rounded-xl py-3 text-center text-xs font-semibold border"
                    style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-secondary)" }}>
                    Locked
                  </div>
                );
              })}
            </div>
          )}

          {!address && (
            <div className="flex justify-center mt-2">
              <ConnectButton label="Connect Wallet" />
            </div>
          )}
        </div>

        {/* ── Tasks ── */}
        <p className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>Tasks</p>
        <div className="space-y-3">

          {/* X Follow */}
          <div
            className="flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#C9693A")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#C9693A18" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#C9693A">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Follow Arc on X</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {xFollowState === "countdown"
                  ? `Verifying in ${xCountdown}s…`
                  : xAlreadyClaimed
                  ? "Reward claimed"
                  : "Follow @arc and earn points"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ background: "#C9693A15", color: "#C9693A" }}>
                +1000
              </span>
              {!xAlreadyClaimed && (
                <button
                  onClick={handleXFollow}
                  disabled={!address || xFollowState === "countdown"}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                  style={{ background: xFollowState === "countdown" ? "#8b8fa8" : "#C9693A" }}
                >
                  {xFollowState === "countdown" ? `${xCountdown}s` : "Follow"}
                </button>
              )}
            </div>
          </div>

          <TaskRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg>}
            title="Make 1 swap" desc="For each completed swap" pts={100}
          />
          <TaskRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>}
            title="Send tokens" desc="For each completed send transaction" pts={75}
          />
          <TaskRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M4 20l17-17"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>}
            title="Bridge USDC" desc="For each completed USDC bridge" pts={200}
          />
          <TaskRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 11h.01M12 11h.01M16 11h.01"/><path d="M12 7V4"/><circle cx="12" cy="3" r="1"/></svg>}
            title="Swap with AI Agent" desc="For each swap approved via AI Agent" pts={250}
          />
          <TaskRow
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><path d="M12 6v6l4 2"/></svg>}
            title="Trade 7 days in a row" desc="When a continuous weekly streak is completed" pts={500}
          />

        </div>
      </main>
      <MobileNav />
    </>
  );
}
