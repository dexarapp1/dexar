"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAccount, useSwitchChain, useBalance } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AppKit } from "@circle-fin/app-kit";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ARC_TOKENS, arcTestnet } from "@/lib/arc-kit";
import { getAdapter } from "@/lib/adapter";
import { addScore } from "@/lib/supabase";

const SEND_TOKENS = ARC_TOKENS;

/* ── Custom token selector with logos ── */
function TokenSelector({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = SEND_TOKENS.find(t => t.symbol === value) ?? SEND_TOKENS[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold border transition-all"
        style={{ background: "var(--bg-card)", borderColor: open ? "#C9693A" : "var(--border)", color: "var(--text-primary)", minWidth: 110 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selected.logoUrl} alt={selected.symbol} width={18} height={18} className="rounded-full shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <span className="flex-1 text-left">{selected.symbol}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-xl border shadow-lg z-50 overflow-hidden"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", minWidth: 130 }}>
          {SEND_TOKENS.map(t => (
            <button key={t.symbol} onClick={() => { onChange(t.symbol); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-all text-left"
              style={{
                background: t.symbol === value ? "var(--bg-input)" : undefined,
                color: "var(--text-primary)",
              }}
              onMouseEnter={e => { if (t.symbol !== value) e.currentTarget.style.background = "var(--bg-input)"; }}
              onMouseLeave={e => { if (t.symbol !== value) e.currentTarget.style.background = ""; }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.logoUrl} alt={t.symbol} width={20} height={20} className="rounded-full shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div>
                <p className="text-sm font-bold leading-none">{t.symbol}</p>
                <p className="text-[10px] leading-none mt-0.5" style={{ color: "var(--text-secondary)" }}>{t.name}</p>
              </div>
              {t.symbol === value && (
                <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SendCard() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [token, setToken] = useState<string>(SEND_TOKENS[0].symbol);
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState("");
  const [status,    setStatus]    = useState<"idle" | "sending" | "success" | "error">("idle");

  const isWrongChain = !!address && chainId !== arcTestnet.id;
  const isPending    = status === "sending";

  // Balance
  const { data: balData } = useBalance({ address, chainId: arcTestnet.id });
  const balFloat = balData ? Number(balData.value) / Math.pow(10, balData.decimals) : 0;
  const balStr   = balFloat > 0 ? balFloat.toFixed(4) : "0";

  const isValidAddress = recipient.startsWith("0x") && recipient.length === 42;

  const handleSend = useCallback(async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !isValidAddress) return;
    setStatus("sending");
    try {
      const kit = new AppKit();
      const adapter = await getAdapter();

      const result = await kit.send({
        from: { adapter, chain: "Arc_Testnet" },
        to: recipient as `0x${string}`,
        amount,
        token,
      });

      toast.success(`Sent ${amount} ${token} → ${recipient.slice(0, 6)}...${recipient.slice(-4)}`);
      // Send task: +75 puan
      addScore(address, 75);
      if (result && "txHash" in result) {
        toast.info(
          <a
            href={`https://testnet.arcscan.app/tx/${(result as { txHash: string }).txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on Explorer ↗
          </a>
        );
      }
      setAmount("");
      setRecipient("");
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      console.error("[send]", err);
      toast.error("Send failed. Please try again.");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }, [address, amount, token, recipient, isValidAddress]);

  const btnLabel =
    !address       ? null
    : isWrongChain ? "Switch to Arc Testnet"
    : isPending    ? "Sending..."
    : !amount      ? "Enter amount"
    : !recipient   ? "Enter recipient"
    : !isValidAddress ? "Invalid address"
    : "Send";

  const canSend = !!address && !isWrongChain && !isPending && !!amount && parseFloat(amount) > 0 && isValidAddress;

  return (
    <div
      className="rounded-2xl border p-4 shadow-2xl w-full max-w-md mx-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="mb-4">
        <h2 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Transfer tokens</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Send any ERC-20 token to a wallet address on Arc Testnet
        </p>
      </div>

      {/* Token selector + amount */}
      <div className="rounded-xl border p-3 mb-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>You send</span>
          {address && (
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Balance: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{balStr}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 bg-transparent text-xl font-bold outline-none min-w-0 w-0"
            style={{ color: "var(--text-primary)" }}
          />
          <TokenSelector value={token} onChange={setToken} />
        </div>
      </div>

      {/* Recipient */}
      <div className="rounded-xl border p-3 mb-4" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
        <div className="mb-2">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Recipient Address</span>
        </div>
        <input
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          className="w-full bg-transparent text-sm font-mono outline-none"
          style={{ color: recipient && !isValidAddress ? "var(--accent-red)" : "var(--text-primary)" }}
        />
        {recipient && !isValidAddress && (
          <p className="text-xs mt-1" style={{ color: "var(--accent-red)" }}>Invalid Ethereum address</p>
        )}
      </div>

      {/* Action button */}
      {!address ? (
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all hover:brightness-110"
              style={{ background: "var(--accent-orange)" }}
            >
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      ) : isWrongChain ? (
        <button
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all hover:brightness-110"
          style={{ background: "var(--accent-red)" }}
        >
          Switch to Arc Testnet
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full rounded-xl py-3 text-sm font-bold transition-all disabled:cursor-not-allowed enabled:hover:brightness-110"
          style={{
            background: canSend ? "linear-gradient(90deg,#C9693A,#B55A2E)" : "var(--bg-input)",
            color:      canSend ? "#fff" : "var(--text-secondary)",
          }}
        >
          {isPending
            ? <span className="flex items-center justify-center gap-2"><LoadingSpinner size={16} color="white" /> {btnLabel}</span>
            : `↗ ${btnLabel ?? "Send"}`}
        </button>
      )}

      {/* Footer */}
      <p className="text-center text-xs mt-3" style={{ color: "var(--text-secondary)" }}>
        Transfers on Arc Testnet ·{" "}
        <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="underline">
          Get test tokens
        </a>
      </p>
    </div>
  );
}
