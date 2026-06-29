/**
 * Kiểm chứng "điều kiện hóa theo drawdown có thêm thông tin?" cho Module C.
 * Chạy: npx tsx scripts/bear-downside-study.ts (fetch XAU như các study khác).
 * 3 điều kiện (đặt conditioningWorks=true khi đạt CẢ 3):
 *  (1) đơn điệu: bucket sâu hơn -> P(đáy phía sau) cao hơn (xét horizon 63);
 *  (2) khác biệt: CI(P-đáy-phía-sau) bucket sâu nhất đủ mẫu KHÔNG trùm CI vô-điều-kiện;
 *  (3) ổn định: (1)+(2) giữ ở CẢ train(<2019) lẫn test(>=2019).
 */
import { fetchXau } from "./fetch";
import { bucketOf, furtherDrawdownPct, computeHorizonStat, BUCKETS, HORIZONS, STEP } from "../src/lib/bear-downside";

const SPLIT = "2019-01-01";
const FOCUS_H = 63; // horizon trọng tâm để xét đơn điệu/tách bạch

function rollingAth(p: number[]): number[] { const o: number[] = []; let m = -Infinity; for (const x of p) { if (x > m) m = x; o.push(m); } return o; }

function analyze(closes: number[], ddFrac: number[], idxs: number[]) {
  // gom mức-rơi-thêm horizon FOCUS_H theo bucket + vô-điều-kiện trên các index cho trước
  const byB: number[][] = BUCKETS.map(() => []);
  const unc: number[] = [];
  for (const i of idxs) {
    const fd = furtherDrawdownPct(closes, i, FOCUS_H);
    if (fd === null) continue;
    byB[bucketOf(ddFrac[i])].push(fd);
    unc.push(fd);
  }
  const bucketStats = byB.map((vals) => computeHorizonStat(vals, FOCUS_H));
  const uncStat = computeHorizonStat(unc, FOCUS_H);
  return { bucketStats, uncStat };
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const ath = rollingAth(closes);
  const ddFrac = closes.map((c, i) => (ath[i] === 0 ? 0 : (ath[i] - c) / ath[i]));

  const grid: number[] = [];
  for (let i = 0; i < closes.length; i += STEP) grid.push(i);
  const tr = grid.filter((i) => dates[i] < SPLIT);
  const te = grid.filter((i) => dates[i] >= SPLIT);

  for (const [name, idxs] of [["TRAIN <2019", tr], ["TEST >=2019", te]] as const) {
    const { bucketStats, uncStat } = analyze(closes, ddFrac, idxs);
    console.log(`\n=== ${name} (horizon ${FOCUS_H} phiên) ===`);
    console.log(`Vô-điều-kiện: P(đáy phía sau) ${uncStat.pBottomBehind}% (CI ${uncStat.pCi?.join("–") ?? "n/a"}), trung vị ${uncStat.median}%, n=${uncStat.n}`);
    bucketStats.forEach((s, b) => {
      const hi = BUCKETS[b].hi === null ? "∞" : Math.round(BUCKETS[b].hi! * 100);
      console.log(`  bucket ${Math.round(BUCKETS[b].lo * 100)}–${hi}%: P ${s.pBottomBehind}% (CI ${s.pCi?.join("–") ?? "n/a"}), trung vị ${s.median}%, n=${s.n}`);
    });
    // (1) đơn điệu giữa các bucket đủ mẫu
    const ok = bucketStats.filter((s) => s.n >= 30);
    const mono = ok.every((s, k) => k === 0 || s.pBottomBehind >= ok[k - 1].pBottomBehind);
    console.log(`  → đơn điệu P theo độ sâu (bucket đủ mẫu): ${mono ? "CÓ" : "KHÔNG"}`);
    // (2) tách bạch: bucket sâu nhất đủ mẫu vs vô-điều-kiện
    const deepest = ok[ok.length - 1];
    const sep = deepest && deepest.pCi && uncStat.pCi ? deepest.pCi[0] > uncStat.pCi[1] : false;
    console.log(`  → CI bucket sâu nhất TÁCH khỏi vô-điều-kiện: ${sep ? "CÓ" : "KHÔNG"}`);
  }
  console.log(`\nKẾT LUẬN: đặt BEAR_DOWNSIDE_CONFIG.conditioningWorks = true CHỈ KHI cả TRAIN lẫn TEST đều "đơn điệu CÓ" và "tách bạch CÓ". Ngược lại = false (chỉ hiện phân phối tổng).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
