"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount }    from "wagmi";
import { AppKit }        from "@circle-fin/app-kit";
import { toast }         from "sonner";
import ReactMarkdown     from "react-markdown";
import remarkGfm         from "remark-gfm";
import { getAdapter }    from "@/lib/adapter";
import { upsertSwapRecord, upsertUserScore } from "@/lib/supabase";
import { addScore }      from "@/lib/supabase";
import { supabase }      from "@/lib/supabase";
import { SWAP_TOKENS }   from "@/lib/arc-kit";

interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
}

interface SwapIntent {
  tokenIn:  string;
  tokenOut: string;
  amountIn: string;
}

interface SendIntent {
  token:     string;
  amount:    string;
  recipient: string;
}

interface SwapQuote {
  tokenIn:         string;
  tokenOut:        string;
  amountIn:        string;
  estimatedOutput: string;
}

const EXAMPLE_PROMPTS = [
  "Swap 1 USDC to EURC",
  "Swap 2 USDC to cirBTC",
  "What is Arc Network?",
  "How do I bridge USDC?",
];

// Kullanıcı mesajından swap intent algıla
function parseSwapIntent(text: string): SwapIntent | null {
  const tokens = SWAP_TOKENS.map(t => t.symbol);
  const pattern = new RegExp(
    `(?:swap\\s+)?(\\d+(?:\\.\\d+)?)\\s+(${tokens.join("|")})\\s+(?:to|for)\\s+(${tokens.join("|")})`,
    "i"
  );
  const match = text.match(pattern);
  if (!match) return null;
  const [, amount, tokenIn, tokenOut] = match;
  if (tokenIn.toUpperCase() === tokenOut.toUpperCase()) return null;
  return { amountIn: amount, tokenIn: tokenIn.toUpperCase(), tokenOut: tokenOut.toUpperCase() };
}

// Kullanıcı mesajından send intent algıla
function parseSendIntent(text: string): SendIntent | null {
  const tokens = SWAP_TOKENS.map(t => t.symbol);
  // "send 10 USDC to 0x..." veya "10 USDC to 0x..."
  const pattern = new RegExp(
    `(?:send\\s+)?(\\d+(?:\\.\\d+)?)\\s+(${tokens.join("|")})\\s+(?:to)\\s+(0x[a-fA-F0-9]{40})`,
    "i"
  );
  const match = text.match(pattern);
  if (!match) return null;
  const [, amount, token, recipient] = match;
  return { amount, token: token.toUpperCase(), recipient };
}

function LoadingDots() {
  return (
    <div className="flex gap-1.5 items-center py-0.5">
      {[0, 1, 2].map(i => (
        <div key={i} className="rounded-full"
          style={{
            width: 7, height: 7, background: "#C9693A",
            animation: `agentBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
      ))}
      <style>{`
        @keyframes agentBounce {
          0%,80%,100%{transform:scale(0.7);opacity:0.4}
          40%{transform:scale(1);opacity:1}
        }
      `}</style>
    </div>
  );
}

// Swap Preview Card
function SwapPreview({
  quote,
  onConfirm,
  onCancel,
  isSwapping,
}: {
  quote:      SwapQuote;
  onConfirm:  () => void;
  onCancel:   () => void;
  isSwapping: boolean;
}) {
  const tokenInInfo  = SWAP_TOKENS.find(t => t.symbol === quote.tokenIn);
  const tokenOutInfo = SWAP_TOKENS.find(t => t.symbol === quote.tokenOut);

  return (
    <div className="rounded-2xl border p-4 mt-2 w-full max-w-sm"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Swap Preview</span>
        </div>
        <button onClick={onCancel} style={{ color: "var(--text-secondary)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Tokens */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--bg-input)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>You pay</p>
          {tokenInInfo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tokenInInfo.logoUrl} alt={quote.tokenIn} width={24} height={24} className="rounded-full mx-auto mb-1"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>{quote.amountIn}</p>
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{quote.tokenIn}</p>
        </div>

        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>

        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--bg-input)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>You receive</p>
          {tokenOutInfo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tokenOutInfo.logoUrl} alt={quote.tokenOut} width={24} height={24} className="rounded-full mx-auto mb-1"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <p className="text-lg font-black" style={{ color: "#C9693A" }}>≈{parseFloat(quote.estimatedOutput).toFixed(4)}</p>
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{quote.tokenOut}</p>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-xl p-3 mb-4 space-y-1.5" style={{ background: "var(--bg-input)" }}>
        <div className="flex justify-between text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Network</span>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Arc Testnet</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Slippage</span>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>0.5%</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={isSwapping}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold border transition-all disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-input)" }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={isSwapping}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#C9693A,#B55A2E)" }}>
          {isSwapping ? "Swapping..." : "Confirm Swap"}
        </button>
      </div>
    </div>
  );
}

// Send Preview Card
function SendPreview({
  intent,
  onConfirm,
  onCancel,
  isSending,
}: {
  intent:    SendIntent;
  onConfirm: () => void;
  onCancel:  () => void;
  isSending: boolean;
}) {
  const tokenInfo = SWAP_TOKENS.find(t => t.symbol === intent.token);
  const short = `${intent.recipient.slice(0, 6)}...${intent.recipient.slice(-4)}`;

  return (
    <div className="rounded-2xl border p-4 mt-2 w-full max-w-sm"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Send Preview</span>
        </div>
        <button onClick={onCancel} style={{ color: "var(--text-secondary)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Amount */}
      <div className="rounded-xl p-4 mb-3 flex items-center gap-3" style={{ background: "var(--bg-input)" }}>
        {tokenInfo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tokenInfo.logoUrl} alt={intent.token} width={32} height={32} className="rounded-full"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <div>
          <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{intent.amount} {intent.token}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Amount to send</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="rounded-xl p-3 mb-4" style={{ background: "var(--bg-input)" }}>
        <p className="text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>To</p>
        <p className="font-mono text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{short}</p>
        <p className="font-mono text-[10px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>{intent.recipient}</p>
      </div>

      {/* Network */}
      <div className="rounded-xl p-3 mb-4" style={{ background: "var(--bg-input)" }}>
        <div className="flex justify-between text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Network</span>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Arc Testnet</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button onClick={onCancel} disabled={isSending}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold border transition-all disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-input)" }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={isSending}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#C9693A,#B55A2E)" }}>
          {isSending ? "Sending..." : "Confirm Send"}
        </button>
      </div>
    </div>
  );
}

export function AgentChat() {
  const { address } = useAccount();
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [swapQuote,  setSwapQuote]  = useState<SwapQuote | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [sendIntent, setSendIntent] = useState<SendIntent | null>(null);
  const [isSending,  setIsSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, swapQuote]);

  // Quote al
  const fetchQuote = useCallback(async (intent: SwapIntent): Promise<SwapQuote | null> => {
    try {
      const res = await fetch("/api/swap-quote", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          tokenIn:     intent.tokenIn,
          tokenOut:    intent.tokenOut,
          amountIn:    intent.amountIn,
          userAddress: address ?? "0x0000000000000000000000000000000000000001",
        }),
      });
      const data = await res.json();
      if (!res.ok) return null;
      return {
        tokenIn:         intent.tokenIn,
        tokenOut:        intent.tokenOut,
        amountIn:        intent.amountIn,
        estimatedOutput: data.estimatedOutput ?? "0",
      };
    } catch {
      return null;
    }
  }, [address]);

  // Mesaj gönder
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setSwapQuote(null);
    setSendIntent(null);

    try {
      // Swap intent algıla
      const swapI = parseSwapIntent(trimmed);
      if (swapI && address) {
        const quote = await fetchQuote(swapI);
        if (quote) {
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Swapping ${swapI.amountIn} ${swapI.tokenIn} for ${swapI.tokenOut}.` }]);
          setSwapQuote(quote);
          return;
        }
      }

      // Send intent algıla
      const sendI = parseSendIntent(trimmed);
      if (sendI && address) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Sending ${sendI.amount} ${sendI.token} to ${sendI.recipient.slice(0, 6)}...${sendI.recipient.slice(-4)}.` }]);
        setSendIntent(sendI);
        return;
      }

      // Normal AI yanıtı
      const history = [...messages, userMsg].slice(-10).map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch("/api/agent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: history, userAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.error ?? "Something went wrong." }]);
      } else {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.content }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, address, fetchQuote]);

  // Swap onayla
  const handleConfirmSwap = useCallback(async () => {
    if (!swapQuote || !address) return;
    setIsSwapping(true);
    try {
      const kitKey = process.env.NEXT_PUBLIC_KIT_KEY;
      if (!kitKey) throw new Error("KIT_KEY not configured");

      const adapter = await getAdapter();
      const kit = new AppKit();

      const result = await kit.swap({
        from:     { adapter, chain: "Arc_Testnet" },
        tokenIn:  swapQuote.tokenIn,
        tokenOut: swapQuote.tokenOut,
        amountIn: swapQuote.amountIn,
        config:   { kitKey },
      });

      toast.success(`✓ Swapped ${swapQuote.amountIn} ${swapQuote.tokenIn} → ${result.amountOut} ${swapQuote.tokenOut}`);

      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    "assistant",
        content: `✅ Swap completed! Swapped **${swapQuote.amountIn} ${swapQuote.tokenIn}** → **${result.amountOut ?? swapQuote.estimatedOutput} ${swapQuote.tokenOut}**${result.txHash ? `\n\n[View on Explorer](https://testnet.arcscan.app/tx/${result.txHash})` : ""}`,
      }]);

      // Supabase kayıt
      upsertSwapRecord({
        user_address: address,
        token_in:     swapQuote.tokenIn,
        token_out:    swapQuote.tokenOut,
        amount_in:    swapQuote.amountIn,
        amount_out:   result.amountOut ?? "0",
        tx_hash:      result.txHash   ?? "",
        chain:        "Arc_Testnet",
      });

      supabase.from("user_scores").select("swap_count, volume_usd").eq("address", address.toLowerCase()).single()
        .then(({ data }) => {
          upsertUserScore({
            address:    address.toLowerCase(),
            swap_count: (data?.swap_count ?? 0) + 1,
            volume_usd: (data?.volume_usd ?? 0) + parseFloat(swapQuote.amountIn),
          });
        });

      addScore(address, 250).catch(() => {});
      setSwapQuote(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed";
      if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) {
        toast.info("Swap cancelled");
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Swap cancelled." }]);
      } else {
        toast.error(msg);
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Swap failed: ${msg}` }]);
      }
      setSwapQuote(null);
    } finally {
      setIsSwapping(false);
    }
  }, [swapQuote, address]);

  // Send onayla
  const handleConfirmSend = useCallback(async () => {
    if (!sendIntent || !address) return;
    setIsSending(true);
    try {
      const adapter = await getAdapter();
      const kit = new AppKit();

      const result = await kit.send({
        from:      { adapter, chain: "Arc_Testnet" },
        to:        sendIntent.recipient as `0x${string}`,
        amount:    sendIntent.amount,
        token:     sendIntent.token,
      });

      toast.success(`✓ Sent ${sendIntent.amount} ${sendIntent.token} → ${sendIntent.recipient.slice(0, 6)}...${sendIntent.recipient.slice(-4)}`);

      setMessages(prev => [...prev, {
        id:      crypto.randomUUID(),
        role:    "assistant",
        content: `✅ Sent **${sendIntent.amount} ${sendIntent.token}** to \`${sendIntent.recipient.slice(0, 6)}...${sendIntent.recipient.slice(-4)}\`${result && "txHash" in result ? `\n\n[View on Explorer](https://testnet.arcscan.app/tx/${(result as { txHash: string }).txHash})` : ""}`,
      }]);

      addScore(address, 75).catch(() => {});
      setSendIntent(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      if (msg.toLowerCase().includes("user rejected") || msg.includes("4001")) {
        toast.info("Send cancelled");
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Send cancelled." }]);
      } else {
        toast.error(msg);
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Send failed: ${msg}` }]);
      }
      setSendIntent(null);
    } finally {
      setIsSending(false);
    }
  }, [sendIntent, address]);

  return (
    <div className="flex flex-col"
      style={{ height: "calc(100dvh - 56px - 64px - env(safe-area-inset-bottom))", background: "var(--bg-primary)" }}>

      {/* Title */}
      <div className="shrink-0 px-4 pt-6 pb-4" style={{ background: "var(--bg-primary)" }}>
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold" style={{ color: "#C9693A" }}>Dexar AI Agent</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            I&apos;ll find the best swap route for you.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-2xl">

          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-3 rounded-2xl px-8 py-10">
                <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="7" width="18" height="13" rx="2"/>
                  <path d="M8 11h.01M12 11h.01M16 11h.01"/>
                  <path d="M12 7V4"/><circle cx="12" cy="3" r="1"/>
                </svg>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Ask me anything about swapping, sending, or bridging on Arc.
                </p>
                <div className="inline-flex flex-wrap gap-3 justify-center">
                  {EXAMPLE_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all border"
                      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "#C9693A")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map(msg => (
            <div key={msg.id} className={`flex mb-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm"
                style={{
                  background:   msg.role === "user" ? "var(--bg-input)" : "var(--bg-card)",
                  color:        "var(--text-primary)",
                  border:       "1px solid var(--border)",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                }}>
                {msg.role === "assistant"
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  : msg.content}
              </div>
            </div>
          ))}

          {/* Swap Preview */}
          {swapQuote && (
            <div className="flex justify-start mb-4">
              <SwapPreview
                quote={swapQuote}
                onConfirm={handleConfirmSwap}
                onCancel={() => setSwapQuote(null)}
                isSwapping={isSwapping}
              />
            </div>
          )}

          {/* Send Preview */}
          {sendIntent && (
            <div className="flex justify-start mb-4">
              <SendPreview
                intent={sendIntent}
                onConfirm={handleConfirmSend}
                onCancel={() => setSendIntent(null)}
                isSending={isSending}
              />
            </div>
          )}

          {/* Loading dots */}
          {loading && (
            <div className="flex justify-start mb-4">
              <div className="rounded-2xl px-5 py-3 border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderRadius: "18px 18px 18px 4px" }}>
                <LoadingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 pb-2 pt-2 border-t"
        style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 rounded-2xl px-4 py-2 border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <textarea rows={1} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about swaps on Arc..."
              disabled={loading || isSwapping || isSending}
              className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
              style={{ color: "var(--text-primary)", maxHeight: 120 }}
            />
            <button onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading || isSwapping || isSending}
              className="shrink-0 flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "#C9693A" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
