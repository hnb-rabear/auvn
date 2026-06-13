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

/**
 * Lưới trọng số bước 0.25 trên 6 feature, tổng = 1.0.
 * Sinh mọi tổ hợp 4 đơn-vị-phần-tư phân bổ trên 6 feature [dd,spd,rsi,macd,macro,mom]
 * (số nguyên a+b+c+d+e+f=4, mỗi trọng số = unit/4). = 126 hồ sơ.
 */
function weightGrid(): Record<string, number>[] {
  const keys = ["dd", "spd", "rsi", "macd", "macro", "mom"];
  const out: Record<string, number>[] = [];
  const rec = (idx: number, left: number, acc: number[]) => {
    if (idx === keys.length - 1) { acc.push(left); const w: Record<string, number> = {}; keys.forEach((k, j) => w[k] = acc[j] / 4); out.push(w); acc.pop(); return; }
    for (let u = 0; u <= left; u++) { acc.push(u); rec(idx + 1, left - u, acc); acc.pop(); }
  };
  rec(0, 4, []);
  return out;
}

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

  // Các bộ ranh giới bin thử nghiệm; "bin cao nhất" = edges.length (score >= ranh giới cuối).
  const EDGE_SETS = [
    [-40, 0, 40],
    [-40, 0, 30],
    [-40, 0, 20],
  ];

  const profiles = weightGrid(); // 126 hồ sơ trọng số
  console.log(`Lưới trọng số: ${profiles.length} hồ sơ | bộ ranh giới: ${EDGE_SETS.length}`);

  for (const [tier, Hs, EPSs] of [
    ["cycle", [84, 126, 168], [3, 4, 5]],
    ["swing", [15, 21, 30], [1.5, 2, 3]],
  ] as const) {
    console.log(`\n=== TẦNG ${tier.toUpperCase()} ===`);
    let best: any = null;     // vượt cổng nghiêm: >=25 cả hai + lift>0 cả hai
    let diag: any = null;     // chẩn đoán: chỉ cần >=25 cả hai (lift có thể âm)
    for (const H of Hs) for (const eps of EPSs) {
      const labels = idxs.map((i) => ({ i, date: dates[i], y: labelNearBottom(closes, i, H, eps) }))
        .filter((r) => r.y !== null) as { i: number; date: string; y: boolean }[];
      const tr = labels.filter((r) => r.date < SPLIT);
      const te = labels.filter((r) => r.date >= SPLIT);
      if (tr.length < 50 || te.length < 50) continue;
      const baseTr = tr.filter((r) => r.y).length / tr.length;
      const baseTe = te.filter((r) => r.y).length / te.length;

      for (const edges of EDGE_SETS) {
        const topBin = edges.length; // bin cao nhất = score >= ranh giới cuối
        for (const w of profiles) {
          // top-bin theo từng giai đoạn: trả {n, lift} hoặc null nếu n<25
          const evalP = (rows: typeof tr, base: number) => {
            const top = rows.filter((r) => binOf(bottomScore(driversByI.get(r.i)!, w), edges) === topBin);
            if (top.length < 25) return null;
            return { n: top.length, lift: top.filter((r) => r.y).length / top.length - base };
          };
          const pt = evalP(tr, baseTr);
          const pe = evalP(te, baseTe);
          if (pt === null || pe === null) continue; // không đủ mẫu ở một giai đoạn
          const minEx = Math.min(pt.lift, pe.lift);
          const cand = { tier, H, eps, edges, w, lt: pt.lift, le: pe.lift, nt: pt.n, ne: pe.n, minEx, baseTr, baseTe };
          // chẩn đoán: best-effort theo min-excess, BỎ QUA yêu cầu lift>0
          if (!diag || minEx > diag.minEx) diag = cand;
          // cổng nghiêm: bắt buộc lift>0 ở CẢ HAI
          if (pt.lift > 0 && pe.lift > 0 && (!best || minEx > best.minEx)) best = cand;
        }
      }
    }

    const fmtEdges = (e: number[]) => `[${e.join(",")}]`;
    if (best) {
      console.log(`✓ ĐẠT CỔNG: H=${best.H} eps=${best.eps}% edges=${fmtEdges(best.edges)}`);
      console.log(`  lift train +${(best.lt*100).toFixed(1)}pt (n=${best.nt}) / test +${(best.le*100).toFixed(1)}pt (n=${best.ne}) | min-excess +${(best.minEx*100).toFixed(1)}pt`);
      console.log(`  baseline train ${(best.baseTr*100).toFixed(1)}% / test ${(best.baseTe*100).toFixed(1)}%`);
      console.log(`  weights = ${JSON.stringify(best.w)}`);
    } else {
      console.log("Không có cấu hình nào vượt baseline ở CẢ HAI giai đoạn.");
    }
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN (không đạt cổng): cấu hình min-excess cao nhất chỉ với yêu cầu >=25 mẫu cả hai giai đoạn ---`);
      console.log(`  H=${diag.H} eps=${diag.eps}% edges=${fmtEdges(diag.edges)}`);
      console.log(`  lift train ${diag.lt >= 0 ? "+" : ""}${(diag.lt*100).toFixed(1)}pt (n=${diag.nt}) / test ${diag.le >= 0 ? "+" : ""}${(diag.le*100).toFixed(1)}pt (n=${diag.ne}) | min-excess ${diag.minEx >= 0 ? "+" : ""}${(diag.minEx*100).toFixed(1)}pt`);
      console.log(`  baseline train ${(diag.baseTr*100).toFixed(1)}% / test ${(diag.baseTe*100).toFixed(1)}%`);
      console.log(`  weights = ${JSON.stringify(diag.w)}`);
    } else {
      console.log("  --- CHẨN ĐOÁN: không có (H,eps,edges,weights) nào đạt nổi >=25 mẫu top-bin ở CẢ HAI giai đoạn ---");
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
