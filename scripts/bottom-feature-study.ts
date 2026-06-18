/**
 * STUDY (Pha 1) — feature ứng viên ryield (lợi suất thực) + gsr (vàng/bạc) có nâng
 * PRECISION bin-cao săn đáy CHU KỲ (H=126, eps=3%) vượt lõi {rsi,macro} không?
 * Grid giới hạn 4 feature {rsi,macro,ryield,gsr} (bước .25) × 3 bộ bin edges,
 * gate 2 giai đoạn (train<2019 / test>=2019) theo precision + recall sàn,
 * CI block-bootstrap. In GO/NO-GO. KHÔNG đổi config — chỉ nghiên cứu.
 *
 * Chạy: npx tsx scripts/bottom-feature-study.ts  (cần mạng: Yahoo + FRED)
 */
import { bottomFeatures, bottomScore, binOf, labelNearBottom } from "../src/lib/bottom";
import { blockBootstrapCi } from "../src/lib/indicators";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y, fetchSilver, fetchRealYield } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756, STEP = 3, H = 126, EPS = 3, RECALL_FLOOR = 40;
const KEYS = ["rsi", "macro", "ryield", "gsr"] as const;

function weightGrid4(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const rec = (idx: number, left: number, acc: number[]) => {
    if (idx === KEYS.length - 1) { acc.push(left); const w: Record<string, number> = {}; KEYS.forEach((k, j) => (w[k] = acc[j] / 4)); out.push(w); acc.pop(); return; }
    for (let u = 0; u <= left; u++) { acc.push(u); rec(idx + 1, left - u, acc); acc.pop(); }
  };
  rec(0, 4, []);
  return out;
}

/** Ghép tỉ lệ vàng/bạc theo ngày của vàng: với mỗi ngày vàng, lấy bạc mới nhất ≤ ngày đó.
 *  Trả mảng cùng độ dài/căn index với goldDates; NaN nếu chưa có bạc. */
function buildGsr(goldDates: string[], goldCloses: number[], silver: { date: string; close: number }[]): number[] {
  const sv = [...silver].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < goldDates.length; i++) {
    while (s + 1 < sv.length && sv[s + 1].date <= goldDates[i]) s++;
    const ok = sv.length > 0 && sv[s].date <= goldDates[i] && sv[s].close > 0;
    out.push(ok ? goldCloses[i] / sv[s].close : NaN);
  }
  return out;
}

async function main() {
  const [xau, dxy, fed, y10, silver, realy] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
    fetchSilver().catch(() => null),
    fetchRealYield().catch(() => null),
  ]);
  if (!silver) { console.error("THIẾU dữ liệu bạc (SI=F) — dừng."); process.exit(1); }
  if (!realy) { console.error("THIẾU lợi suất thực (DFII10) — dừng."); process.exit(1); }

  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const gsrAligned = buildGsr(dates, closes, silver.bars);

  const gridDays: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) gridDays.push(i);

  // drivers tính 1 lần/ngày (độc lập trọng số/edges)
  type Row = { i: number; date: string; drivers: ReturnType<typeof bottomFeatures>; label: boolean | null };
  const rows: Row[] = gridDays.map((i) => {
    const di = dates[i];
    return {
      i, date: di,
      drivers: bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: y10 ? y10.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
        realYieldCloses: realy.bars.filter((b) => b.date <= di).map((b) => b.close),
        gsrCloses: gsrAligned.slice(0, i + 1),
      }),
      label: labelNearBottom(closes, i, H, EPS),
    };
  });

  // độ phủ dữ liệu
  const covRy = rows.filter((r) => r.drivers.find((d) => d.id === "ryield")!.available).length;
  const covGsr = rows.filter((r) => r.drivers.find((d) => d.id === "gsr")!.available).length;
  console.log(`Lưới ${rows.length} ngày (${dates[WARMUP]}→${dates[dates.length - 1]}) · phủ ryield ${covRy}/${rows.length} · phủ gsr ${covGsr}/${rows.length}`);

  const EDGE_SETS = [[-40, 0, 40], [-40, 0, 30], [-40, 0, 20]];
  const labeled = (rs: Row[]) => rs.filter((r) => r.label !== null);
  const stat = (rs: Row[], w: Record<string, number>, edges: number[]) => {
    const lab = labeled(rs);
    const base = lab.length ? lab.filter((r) => r.label).length / lab.length : 0;
    const top = lab.filter((r) => binOf(bottomScore(r.drivers, w), edges) === edges.length);
    const n = top.length;
    const prec = n ? top.filter((r) => r.label).length / n : 0;
    return { base, n, prec, arr: top.map((r) => (r.label ? 1 : -1)) };
  };
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);

  // mốc: lõi {rsi:.5,macro:.5}, edges chuẩn [-40,0,40]
  const BASE_W = { rsi: 0.5, macro: 0.5, ryield: 0, gsr: 0 };
  const baseTest = stat(test, BASE_W, [-40, 0, 40]);
  const baseTrain = stat(train, BASE_W, [-40, 0, 40]);
  console.log(`\nMỐC {rsi:.5,macro:.5}: train prec ${(baseTrain.prec * 100).toFixed(0)}% (n=${baseTrain.n}, base ${(baseTrain.base * 100).toFixed(0)}%) | test prec ${(baseTest.prec * 100).toFixed(0)}% (n=${baseTest.n}, base ${(baseTest.base * 100).toFixed(0)}%)`);

  const profiles = weightGrid4();
  type Cand = { w: Record<string, number>; edges: number[]; tr: ReturnType<typeof stat>; te: ReturnType<typeof stat> };
  const passed: Cand[] = [];
  for (const edges of EDGE_SETS) for (const w of profiles) {
    const tr = stat(train, w, edges), te = stat(test, w, edges);
    const gate = tr.prec > tr.base && te.prec > te.base; // vượt baseline cả 2 giai đoạn
    if (gate && te.n >= RECALL_FLOOR && tr.n >= RECALL_FLOOR) passed.push({ w, edges, tr, te });
  }
  passed.sort((a, b) => b.te.prec - a.te.prec);

  console.log(`\n${passed.length} cấu hình qua gate (recall sàn n>=${RECALL_FLOOR} cả 2 giai đoạn). Top 5 theo precision test:`);
  const fmtW = (w: Record<string, number>) => KEYS.map((k) => `${k} ${w[k]}`).filter((s) => !s.endsWith(" 0")).join(" ");
  for (const c of passed.slice(0, 5)) {
    const ci = blockBootstrapCi(c.te.arr, Math.max(1, Math.round(H / 3)));
    console.log(`  [${c.edges.join(",")}] ${fmtW(c.w)} | test prec ${(c.te.prec * 100).toFixed(0)}% n=${c.te.n}${ci ? ` CI[${ci[0]}-${ci[1]}]` : ""} | train prec ${(c.tr.prec * 100).toFixed(0)}% n=${c.tr.n}`);
  }

  // GO: cấu hình tốt nhất CÓ ryield|gsr>0, CI test lo > precision mốc, qua gate, recall sàn
  const best = passed.find((c) => c.w.ryield > 0 || c.w.gsr > 0);
  let go = false;
  if (best) {
    const ci = blockBootstrapCi(best.te.arr, Math.max(1, Math.round(H / 3)));
    go = !!ci && ci[0] > baseTest.prec * 100;
    console.log(`\nỨng viên tốt nhất CÓ feature mới: [${best.edges.join(",")}] ${fmtW(best.w)} | test prec ${(best.te.prec * 100).toFixed(0)}%${ci ? ` CI[${ci[0]}-${ci[1]}]` : ""} vs mốc ${(baseTest.prec * 100).toFixed(0)}%`);
  } else {
    console.log(`\nKhông cấu hình nào qua gate có trọng số ryield/gsr > 0.`);
  }
  console.log(`\n${go ? "GO" : "NO-GO"} — ${go ? "feature mới nâng precision test vượt mốc (CI không chồng); cân nhắc Pha 2." : "không đủ bằng chứng feature mới vượt mốc; giữ cấu hình hiện tại."}`);
}

main();
