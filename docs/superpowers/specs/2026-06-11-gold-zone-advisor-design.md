# Gold Buy/Sell Zone Advisor — Design

Date: 2026-06-11. Status: approved (user delegated remaining decisions).

## Purpose

Free PWA helping a Vietnamese physical-gold buyer (SJC bars / rings) decide when to buy and sell. Not a price tracker: scores buy/sell zones across 4 criterion groups, reports confidence % validated by backtest. Decision support, no prediction claims. UI in Vietnamese.

## Architecture (Approach A)

All analysis runs at data-collection time (GitHub Actions cron 2×/day), never at page load. Git repo is the database.

```
GitHub Actions cron → fetch prices → append history → score 4 criteria
  → backtest XAU history → write public/data/*.json → commit → deploy
Static PWA (GitHub Pages / Vercel) → reads precomputed JSON only
```

- Stack: Next.js + TypeScript, `output: 'export'`. Scripts run with tsx under Node 20.
- No paid services. No browser calls to external APIs (CORS).
- Cron failure: keep last data, UI shows "dữ liệu cũ N ngày" warning. Never blank.

## Data sources (free, with fallbacks)

| Data | Primary | Fallback | History |
|---|---|---|---|
| SJC bar + ring | sjc.com.vn public endpoint | BTMC public endpoint | self-accumulated in `data/history/vn-gold.json` |
| XAU/USD | Stooq CSV (`xauusd`) | Yahoo Finance chart API | 20+ yrs fetched fresh each run |
| DXY | Stooq (`dx.f` / `usdx`) | Yahoo | fetched fresh |
| USD/VND | Vietcombank exchange-rate API | exchangerate.host | self-accumulated |
| Fed funds rate | FRED public CSV (`fredgraph.csv?id=FEDFUNDS`, no key) | skip → neutral score | full |

## Scoring engine

Sub-signal scores −2..+2 (negative = sell-leaning), each with Vietnamese explanation. Groups and default weights (user-adjustable; UI recomputes composite client-side from shipped sub-scores):

1. **XAU/USD technicals 35%** — RSI(14) daily + weekly, price vs MA50/MA200, distance to 52-week high/low, support/resistance from 6-month swings
2. **VN–world premium 25%** — SJC premium vs converted world price scored by percentile of self-collected premium history; SJC bid-ask spread width; ring-vs-bar anomaly. Until history ≥ 90 days, premium percentile uses fixed reference thresholds and is flagged as provisional.
3. **Macro 20%** — DXY vs MA50 + 1-month trend, Fed rate 3-month direction, USD/VND 1-month pace
4. **Historical stats 20%** — XAU percentile vs 1y/3y, month-of-year seasonality, 30-day volatility regime

Composite = weighted sum normalized to −100..+100.
≥ +40 BUY zone (≥ +70 strong) · ≤ −40 SELL zone (≤ −70 strong) · else NEUTRAL.

## Backtest (integrity rule)

Replay engine over ~15y of XAU/USD daily history using world-computable criteria (groups 1, 4 + DXY part of 3) with default weights. For each day classify zone; measure XAU return after 21/63/126 trading days. Output per zone bucket: occurrences, % positive (for BUY; % negative for SELL), median return. Displayed as: "Tín hiệu MUA mức này: N lần trong 15 năm, X% giá cao hơn sau 3 tháng, trung vị +Y%".

VN-premium criterion backtested only once ≥ 6 months self-collected data exists; until then UI shows "chưa đủ dữ liệu kiểm chứng". Never fabricate numbers.

## UI (single dashboard page, Vietnamese)

1. Verdict card: zone label + composite gauge (−100..+100) + backtest confidence for current zone + data-freshness stamp
2. Price strip: SJC buy/sell, ring, world price converted to VND/lượng, premium %
3. Four criterion cards: group score + sub-signal rows (chip −2..+2 + explanation)
4. Backtest panel: stats table per zone/horizon
5. Settings sheet: weight sliders (localStorage), reset to default
6. Disclaimer footer: decision support, not financial advice

PWA: manifest + minimal service worker (cache-first shell, network-first for data JSON).

## Repo layout

```
scripts/         fetchers, engine, backtest, run.ts orchestrator
src/app/         Next.js pages
src/lib/         shared types + client-side composite recompute
public/data/     committed JSON outputs (analysis.json, backtest.json, history/)
.github/workflows/cron.yml + deploy
```

## Testing

Vitest on engine: indicators (RSI/MA/percentile/volatility), each criterion scorer against fixture series, composite + thresholds, backtest bucketing. Fetchers tested against recorded fixtures; live fetch smoke-tested in cron only.

## Error handling

Every fetcher: try primary → fallback → on total failure reuse last committed history entry and mark `stale: true` with date. Engine treats missing inputs as neutral (score 0, explanation "không có dữ liệu"). Run never throws past orchestrator; partial results still written.
