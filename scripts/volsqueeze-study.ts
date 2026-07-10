/**
 * VOL SQUEEZE — tín hiệu MỚI: canh vào khi biến động (vol30) đang THẤP so với lịch sử
 * gần (nén biên độ), không phải canh giá thấp (vị trí/percentile giá — họ này đã LOẠI
 * ở dca-zone-study-v2.ts). Cơ chế khác: nén biên độ thường đi trước một cú bung mạnh;
 * vàng thiên hướng tăng dài hạn nên mua ĐÚNG LÚC nén (trước khi bung) có thể rẻ hơn
 * chờ đến khi biên độ đã mở lại. Chưa từng test trong repo (dca-zone-study-v2.ts chỉ
 * có relpos/zscore/bollinger/stoch/rsi/drawWin/pullback — toàn bộ theo VỊ TRÍ giá).
 *
 * Cùng khung đo đã validate: neo mỗi H=21 phiên (~30 ngày dương lịch) không chồng lấp,
 * rangePos so mua-ngay + placebo, train(<2019)/test(≥2019), CI95 block-bootstrap ghép cặp.
 * Rule mới "volsqueeze" thêm vào src/lib/dca-window.ts (percentile của vol30 trong cửa
 * sổ trailing `window`, bật khi percentile ≤ `pct` — vol hiện tại thấp hơn hầu hết lịch
 * sử gần). Unit test: src/lib/dca-window.test.ts "inZoneV2 volsqueeze".
 *
 * Cổng (CẢ HAI giai đoạn train/test): Δmua-ngay<0, Δplacebo<0, CI95(Δmua-ngay) lệch khỏi
 * 0, meanPos ≤ 0.40 — giống hệt dca-zone-study-v2.ts.
 *
 * Chạy: npx tsx scripts/volsqueeze-study.ts (fetch XAU, ~15 năm dữ liệu)
 */
import { fetchXau } from "./fetch";
import { evalWindow, rangePos, type ZoneRuleV2 } from "../src/lib/dca-window";
import { pairedBlockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const H = 21;
const ANCHOR_STEP = 21;
const WARMUP = 252;

function ruleGrid(): ZoneRuleV2[] {
  const out: ZoneRuleV2[] = [];
  for (const window of [21, 42, 63, 126]) {
    for (const pct of [10, 15, 20, 25, 30]) out.push({ kind: "volsqueeze", window, pct });
  }
  return out;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const anchors: number[] = [];
  for (let t = WARMUP; t + H < closes.length; t += ANCHOR_STEP) anchors.push(t);
  const trA = anchors.filter((t) => dates[t] < SPLIT);
  const teA = anchors.filter((t) => dates[t] >= SPLIT);

  const rand = seededRandom(20260706);
  const baseNow = new Map<number, number>();
  const basePlacebo = new Map<number, number>();
  for (const t of anchors) {
    let lo = Infinity, hi = -Infinity;
    for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
    baseNow.set(t, rangePos(closes[t], lo, hi));
    const r = t + Math.floor(rand() * (H + 1));
    basePlacebo.set(t, rangePos(closes[r], lo, hi));
  }

  const block = Math.max(4, Math.ceil(H / ANCHOR_STEP) + 3);
  const phaseStats = (A: number[], rule: ZoneRuleV2) => {
    const dNow: number[] = [], dPla: number[] = [], posArr: number[] = [];
    for (const t of A) {
      const e = evalWindow(closes, t, H, rule, 0);
      if (!e) continue;
      dNow.push(e.pos - baseNow.get(t)!);
      dPla.push(e.pos - basePlacebo.get(t)!);
      posArr.push(e.pos);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      n: posArr.length,
      meanPos: mean(posArr),
      meanDNow: mean(dNow),
      meanDPla: mean(dPla),
      ciNow: pairedBlockBootstrapCi(dNow, block),
    };
  };

  console.log(`Vol Squeeze — ${anchors.length} neo (train ${trA.length}/test ${teA.length}), H=${H}, neo mỗi ${ANCHOR_STEP} phiên.`);
  console.log(`Tham chiếu: mua-ngay & placebo rangePos kỳ vọng ~0.5.`);

  let best: any = null;
  let diag: any = null;
  const rows: any[] = [];
  for (const rule of ruleGrid()) {
    const tr = phaseStats(trA, rule);
    const te = phaseStats(teA, rule);
    if (tr.n < 20 || te.n < 20) continue;
    rows.push({ rule, tr, te });
    if (!diag || te.meanDNow < diag.te.meanDNow) diag = { rule, tr, te };
    const pass =
      tr.meanDNow < 0 && te.meanDNow < 0 && tr.meanDPla < 0 && te.meanDPla < 0 &&
      tr.ciNow && tr.ciNow[1] < 0 && te.ciNow && te.ciNow[1] < 0 &&
      te.meanPos <= 0.40;
    const score = Math.max(tr.meanDNow, te.meanDNow);
    if (pass && (!best || score < best.score)) best = { rule, tr, te, score };
  }

  const fmt = (s: any) => `meanPos ${s.meanPos.toFixed(3)} Δnow ${s.meanDNow.toFixed(3)} (CI ${s.ciNow ? s.ciNow.join("..") : "—"}) Δpla ${s.meanDPla.toFixed(3)} n=${s.n}`;

  console.log(`\n${rows.length} cấu hình đủ mẫu (n≥20 cả 2 giai đoạn). QUA CỔNG: ${rows.filter((r) => {
    const p = r.tr.meanDNow < 0 && r.te.meanDNow < 0 && r.tr.meanDPla < 0 && r.te.meanDPla < 0 &&
      r.tr.ciNow && r.tr.ciNow[1] < 0 && r.te.ciNow && r.te.ciNow[1] < 0 && r.te.meanPos <= 0.40;
    return p;
  }).length}`);

  if (best) {
    console.log(`\n✓ LUẬT THẮNG: ${JSON.stringify(best.rule)}`);
    console.log(`  train: ${fmt(best.tr)}`);
    console.log(`  test : ${fmt(best.te)}`);
    console.log("\nPHÁN QUYẾT: GO");
  } else {
    console.log(`\n✗ KHÔNG luật volsqueeze nào vượt mua-ngay + placebo (CI lệch khỏi 0) ở cả hai giai đoạn với size đáng kể.`);
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN: ứng viên 'gần đạt' nhất (te.meanDNow thấp nhất, KHÔNG đạt cổng) ---`);
      console.log(`  ${JSON.stringify(diag.rule)}`);
      console.log(`  train: ${fmt(diag.tr)}`);
      console.log(`  test : ${fmt(diag.te)}`);
    }
    console.log("\nPHÁN QUYẾT: NO-GO");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
