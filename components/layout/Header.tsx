"use client";

import Link         from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/lib/theme";
import { SocialButtons } from "@/components/ui/SocialButtons";

/* ── Nav emoji icons ── */
const Emoji = ({ e }: { e: string }) => <span style={{ fontSize: 14, lineHeight: 1 }}>{e}</span>;

const NAV = [
  { href: "/swap",         label: "Swap",             Icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/></svg> },
  { href: "/send",         label: "Send",             Icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
  { href: "/bridge",       label: "Bridge",           Icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="M16 3h5v5"/><path d="M4 20l17-17"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg> },
  { href: "/agent",        label: "AI Agent",         Icon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9693A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 11h.01M12 11h.01M16 11h.01"/><path d="M12 7V4"/><circle cx="12" cy="3" r="1"/></svg> },
  { href: "/wallet-stats", label: "Arc Wallet Stats", Icon: () => <Emoji e="📊" /> },
  { href: "/leaderboard",  label: "Leaderboard",      Icon: () => <Emoji e="🏆" /> },
  { href: "/reward",       label: "Reward",           Icon: () => <Emoji e="⭐" /> },
  { href: "/profile",      label: "Profile",          Icon: () => <Emoji e="👤" /> },
];

/* ── Theme toggle — birebir Routis ── */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-lg border transition-all"
      style={{
        borderColor: "var(--border)",
        background:  "var(--bg-input)",
        color:       "var(--text-secondary)",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#C9693A66")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1"  x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

/* ── Arbi Logo — Routis'teki gibi ikon + isim ── */
function ArbiLogo() {
  return (
    <Link href="/swap" className="flex items-center no-underline shrink-0" style={{ marginLeft: "8px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dexar.png"
        alt="Dexar"
        width={100}
        height={100}
        className="rounded-xl"
      />
    </Link>
  );
}

/* ── Header ── */
export function Header() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 relative">

        {/* Logo */}
        <ArbiLogo />

        {/* Desktop nav — tam ortada, tek satır */}
        <nav className="hidden md:flex items-center gap-0 absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all"
                style={{
                  border:     `1px solid ${active ? "#C9693A4D" : "transparent"}`,
                  background: active ? "#C9693A1A" : "transparent",
                  color:      active ? "#C9693A"   : "var(--text-secondary)",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: social + theme + wallet */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex">
            <SocialButtons />
          </div>
          <ThemeToggle />

          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
              if (!mounted) return null;
              if (!account || !chain) {
                return (
                  <>
                    <button onClick={openConnectModal}
                      className="flex md:hidden items-center rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110 whitespace-nowrap"
                      style={{ background: "#C9693A" }}>
                      Connect
                    </button>
                    <button onClick={openConnectModal}
                      className="hidden md:flex rounded-xl px-4 py-2 text-sm font-bold text-white transition-all hover:brightness-110"
                      style={{ background: "#C9693A" }}>
                      Connect Wallet
                    </button>
                  </>
                );
              }
              return (
                <button onClick={openAccountModal}
                  className="flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all"
                  style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#C9693A66")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    {account.displayName}
                  </span>
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
}
