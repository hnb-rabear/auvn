# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Gold buy/sell zone advisor** — a free PWA that helps the user (Vietnamese, buys physical SJC/ring gold) decide when to buy or sell. It is NOT a price tracker: it scores buy/sell zones across multiple criteria and reports a probability-style confidence %, validated by backtest. No prediction claims — decision support only.

Status: fully built and committed. Original design doc: `docs/superpowers/specs/2026-06-11-gold-zone-advisor-design.md`; preset methodology + all study evidence: `docs/presets.md` (keep its tables in sync with `PRESETS` in `src/lib/types.ts`). User communicates in Vietnamese; UI text is Vietnamese.

Key commands: `npm run collect` (fetch + analyze + backtest → public/data/), `npm test`, `npm run build`, `npx tsx scripts/monitor-presets.ts` (preset health), `npx tsx scripts/check-modes.ts` (print all-mode composites for UI debugging). Studies: `presets-study`, `factor-study`, `factor-study-momentum-offline` (offline 4D ablation), `premium-buy-study` (premium gating for buy), `premium-streak-study` (VN sell signal: streak + SJC momentum), `sell-signal-study` + `sell-signal-study-2/3/4/5` (world sell signal: grid search → regime detector → combination test), `single-factor-study`, `horizon-study`, `optimize-study`, `backfill-vn` (one-off CafeF history import).

## Agreed architecture (Approach A — do not silently change)

All analysis runs at data-collection time, not at page load. The Git repo is the database.

- **GitHub Actions cron (2×/day):** fetches prices → runs scoring engine → runs backtest → commits results as JSON under `data/` → auto-deploys.
- **Static PWA (Vercel or GitHub Pages):** reads precomputed `data/*.json` only. No external API calls from the browser (CORS is why), no server, no paid services anywhere.
- Stack: Next.js + TypeScript, static export.

### Data sources (all free, each needs a fallback)

| Data | Primary | History |
| --- | --- | --- |
| SJC / ring gold price | BTMC public API (quotes **VND/chỉ** — normalize ×10) | self-accumulated daily; fallback SJC endpoints (Cloudflare-blocked as of 2026-06, kept as fallback only) |
| XAU/USD, DXY | Yahoo Finance chart API (`GC=F`, `DX-Y.NYB`) | 20 yrs; fallback Stooq (404'd as of 2026-06) |
| USD/VND | Vietcombank pXML endpoint | self-accumulated; fallback open.er-api.com |
| Fed rates | FRED public CSV `fredgraph.csv?id=FEDFUNDS` (no key needed) | full; fallback local cache `public/data/history/fed-funds.json` (refreshed each successful fetch, never overwritten by a shorter response) — a transient FRED outage used to blank macro across all history |
| US 10y yield | Yahoo `^TNX` (nominal — all preset evidence validated on it) | 20 yrs; fallback FRED DFII10 (real yield, but FRED 504s on daily series often) |

Tested and REJECTED signals (do not re-add without re-running `scripts/factor-study.ts`): GPR geopolitical index (hurts accuracy at every horizon), VIX (no improvement over the yield signal). Evidence in docs/presets.md.

VN price normalization: sources quote per-lượng, per-chỉ, or thousand-VND — `normalizeVnd()` tries ×1/×10/×1000/×10000 and picks the value landing in 50–600M VND/lượng. If gold price leaves that band someday, update it.

Cron failure must never blank the app: keep last data, show a "data is N days old" warning.

## Scoring engine (core domain logic)

Each criterion = multiple sub-signals, each scored **−2..+2** (negative = sell-leaning, positive = buy-leaning) with a Vietnamese explanation string. Four criterion groups with default weights (user-adjustable in settings):

1. **XAU/USD technicals (35%)** — RSI(14) daily+weekly, MA50/MA200, 52-week high/low distance, support/resistance from 6-month swings
2. **VN–world premium (25%)** — SJC vs converted world price (percentile vs premium history; high premium = sell signal / don't buy), SJC bid-ask spread width, ring-vs-bar anomaly
3. **Macro (20%)** — DXY vs MA50 + 1-month trend, Fed rate direction, USD/VND pace
4. **Historical stats (20%)** — price percentile vs 1y/3y, monthly seasonality (Tết / Thần Tài effects), 30-day volatility

Composite: weighted sum normalized to −100..+100. Thresholds: ≥+40 BUY zone (≥+70 strong), ≤−40 SELL zone (≤−70 strong), otherwise NEUTRAL.

**Backtest rule (integrity-critical):** confidence % must come from replaying the engine over ~15 years of XAU/USD history (e.g., "BUY signal at this level: 134 occurrences, 71% higher after 3 months, avg +4.2%"). VN-premium criterion is only backtested once ≥6 months of self-collected data exists; before that the UI must say "chưa đủ dữ liệu kiểm chứng" — never fabricate a number.

**Backtest must mirror the live engine's criterion gating (do not silently change):** the historical timeline (`scripts/backtest.ts`) computes the macro criterion whenever DXY is available — Fed, 10y yield, USD/VND are optional, exactly as `macroCriterion` skips its own missing sub-signals on the live path. Do NOT gate macro on all inputs being present (`if (dxy && fed)`): the presets weight macro at 0.9, so a single missing input there silently strips 90% of every preset's signal from all history and produces zero buy signals in a clear uptrend. Regression-guarded by the "includes the macro criterion when DXY is present but Fed is missing" test.

## Conventions

- UI language: Vietnamese. Signal explanations are user-facing Vietnamese strings, not codes.
- Everything must run on free tiers (GitHub Actions, Vercel/GitHub Pages, FRED free key). Reject designs requiring paid infra.
- Historical VN gold data is scarce: the daily cron commit IS the accumulation strategy — protect `data/` history, never rewrite it.
