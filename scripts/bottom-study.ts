/**
 * Tuyển ε/H + trọng số feature cho tầng đáy. Chạy: npx tsx scripts/bottom-study.ts
 * Cần dữ liệu thật: chạy `npm run collect` trước (study tự fetch lại qua fetch.ts).
 * Tiêu chí nhận: bin "gần đáy nhất" vượt base-rate vô điều kiện ở CẢ HAI giai đoạn
 * train (<2019) và test (>=2019); xếp theo min-excess.
 */
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const idxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
  const driversByI = new Map<number, ReturnType<typeof bottomFeatures>>();
  for (const i of idxs) {
    const di = dates[i];
    driversByI.set(i, bottomFeatures({
      closes: closes.slice(0, i + 1),
      dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
      yieldCloses: yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
      fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
    }));
  }

  const EDGES = [-40, 0, 40]; // bin cao nhất (3) = "gần đáy nhất"

  for (const [tier, Hs, EPSs] of [
    ["cycle", [84, 126, 168], [3, 4, 5]],
    ["swing", [15, 21, 30], [1.5, 2, 3]],
  ] as const) {
    console.log(`\n=== TẦNG ${tier.toUpperCase()} ===`);
    let best: any = null;
    for (const H of Hs) for (const eps of EPSs) {
      const labels = idxs.map((i) => ({ i, date: dates[i], y: labelNearBottom(closes, i, H, eps) }))
        .filter((r) => r.y !== null) as { i: number; date: string; y: boolean }[];
      const tr = labels.filter((r) => r.date < SPLIT);
      const te = labels.filter((r) => r.date >= SPLIT);
      if (tr.length < 50 || te.length < 50) continue;
      const baseTr = tr.filter((r) => r.y).length / tr.length;
      const baseTe = te.filter((r) => r.y).length / te.length;

      const profiles: Record<string, number>[] = [
        { dd: 0.25, spd: 0.1, rsi: 0.15, macd: 0.1, macro: 0.3, mom: 0.1 },
        { dd: 0.2, spd: 0.2, rsi: 0.3, macd: 0.2, macro: 0.1, mom: 0 },
        { dd: 0.4, spd: 0.2, rsi: 0.2, macd: 0.1, macro: 0.1, mom: 0 },
        { dd: 0.15, spd: 0.15, rsi: 0.2, macd: 0.15, macro: 0.25, mom: 0.1 },
        { macro: 0.5, dd: 0.2, mom: 0.1, rsi: 0.1, spd: 0.05, macd: 0.05 },
      ];
      for (const w of profiles) {
        const lift = (rows: typeof tr, base: number) => {
          const top = rows.filter((r) => binOf(bottomScore(driversByI.get(r.i)!, w), EDGES) === EDGES.length);
          if (top.length < 25) return null;
          return top.filter((r) => r.y).length / top.length - base;
        };
        const lt = lift(tr, baseTr);
        const le = lift(te, baseTe);
        if (lt === null || le === null || lt <= 0 || le <= 0) continue;
        const minEx = Math.min(lt, le);
        if (!best || minEx > best.minEx) best = { tier, H, eps, w, lt, le, minEx, baseTr, baseTe };
      }
    }
    if (best) {
      console.log(`H=${best.H} eps=${best.eps}% | lift train +${(best.lt*100).toFixed(1)}pt / test +${(best.le*100).toFixed(1)}pt | min-excess +${(best.minEx*100).toFixed(1)}pt`);
      console.log(`baseline train ${(best.baseTr*100).toFixed(1)}% / test ${(best.baseTe*100).toFixed(1)}%`);
      console.log(`weights = ${JSON.stringify(best.w)}`);
    } else {
      console.log("Không có cấu hình nào vượt baseline ở CẢ HAI giai đoạn — tầng này CHƯA đủ tin cậy.");
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
