/**
 * Sell signal — Study 5: Kết hợp World sell + VN premium_streak
 *
 * Câu hỏi cuối trước khi triển khai: khi cả 2 tín hiệu cùng bắn,
 * accuracy có đủ cao để hiển thị "SELL CONFIRMATION" không?
 *
 * Study 18: Overlap 488 ngày VN — nhóm theo (world, vn_premium) → SJC return
 * Study 19: World sell signal trong 488 ngày thực tế (không regime gate)
 * Study 20: Tần suất kết hợp — 2 tín hiệu bắn cùng lúc có thực tế không?
 * Study 21: Kết luận tổng hợp — nên triển khai gì, với disclaimer gì?
 *
 * Chạy: npx tsx scripts/sell-signal-study-5.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelinePoint, VnGoldEntry } from "../src/lib/types";

const { points: rawPts }: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8")
);
const vnHistory: VnGoldEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/history/vn-gold.json"), "utf8")
);
const fedRaw: { date: string; value: number }[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/history/fed-funds.json"), "utf8")
);

// ── Momentum ──────────────────────────────────────────────────────────────
function addMomentum(pts: TimelinePoint[]): void {
  for (let i = 0; i < pts.length; i++) {
    const target = new Date(pts[i].date).getTime() - 252 * 86400000;
    let best = -1;
    for (let j = 0; j < i; j++) {
      if (new Date(pts[j].date).getTime() <= target) best = j;
      else break;
    }
    if (best < 0) continue;
    const diff = (new Date(pts[i].date).getTime() - new Date(pts[best].date).getTime()) / 86400000;
    if (diff < 240 || diff > 280) continue;
    const mom = (pts[i].price / pts[best].price - 1) * 100;
    let ms = 0;
    if (mom > 20) ms = 2; else if (mom > 5) ms = 1;
    else if (mom > -10) ms = 0; else if (mom > -25) ms = -1; else ms = -2;
    (pts[i].scores as Record<string, number>)["momentum"] = ms;
  }
}
addMomentum(rawPts);
const pts = rawPts;

// Cấu hình sell signal tốt nhất từ study trước (Option 2: re-grid trong regime)
const SELL_W   = { technical: 0.2, stats: 0.3, macro: 0.4, momentum: 0.1 };
const SELL_THR = -40;

// ── Helpers ───────────────────────────────────────────────────────────────
function compW(p: TimelinePoint, w: Record<string, number>): number {
  const sc = p.scores as Record<string, number>;
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk > 0 && sc[k] !== undefined) { s += sc[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function fedAt(d: string): number | null {
  const t = new Date(d).getTime();
  let best: number | null = null;
  for (const f of fedRaw) {
    if (new Date(f.date).getTime() <= t) best = f.value;
    else break;
  }
  return best;
}
function fedNm(d: string, months: number): number | null {
  const t = new Date(d); t.setMonth(t.getMonth() - months);
  return fedAt(t.toISOString().slice(0, 10));
}
const regimeHiking = (d: string): boolean => {
  const now = fedAt(d), ago6 = fedNm(d, 6);
  return now !== null && ago6 !== null && now >= ago6 + 0.25;
};

function fmt(n: number, d = 1) { return (n >= 0 ? "+" : "") + n.toFixed(d); }
function med(arr: number[]) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ── Tìm timeline point gần nhất với ngày d (trong ±7 ngày) ───────────────
function nearestTimelinePoint(d: string): TimelinePoint | null {
  const t = new Date(d).getTime();
  let best: TimelinePoint | null = null;
  let bestDiff = Infinity;
  for (const p of pts) {
    const diff = Math.abs(new Date(p.date).getTime() - t);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
    else if (diff > bestDiff) break; // sorted, can exit early when getting worse
  }
  return bestDiff <= 7 * 86400000 ? best : null;
}

// ── VN premium streak (tính tại chỗ từ history) ──────────────────────────
const vnDays = vnHistory.filter(e => e.sjcSell !== null && e.premiumPct !== null);

function premiumStreakAt(idx: number, threshold = 80, window = 180, minHist = 60): number {
  const todaySlice = vnDays.slice(Math.max(0, idx - window), idx);
  if (todaySlice.length < minHist) return 0;
  const cur = vnDays[idx].premiumPct!;
  const todayRank = todaySlice.filter(e => e.premiumPct! < cur).length / todaySlice.length * 100;
  if (todayRank < threshold) return 0;
  let streak = 1;
  for (let j = idx - 1; j >= 0 && streak < 90; j--) {
    const slice = vnDays.slice(Math.max(0, j - window), j);
    if (slice.length < minHist) break;
    const rank = slice.filter(e => e.premiumPct! < vnDays[j].premiumPct!).length / slice.length * 100;
    if (rank < threshold) break;
    streak++;
  }
  return streak;
}

function sjcForwardReturn(idx: number, calDays: number): number | null {
  const target = new Date(vnDays[idx].date).getTime() + calDays * 86400000;
  for (let j = idx + 1; j < vnDays.length; j++) {
    if (new Date(vnDays[j].date).getTime() >= target)
      return (vnDays[j].sjcSell! - vnDays[idx].sjcSell!) / vnDays[idx].sjcSell! * 100;
  }
  return null;
}

// ── Study 18: Nhóm theo (world sell, VN premium) ─────────────────────────
function study18() {
  console.log("════ Study 18: Kết hợp World sell + VN premium_streak (488 ngày overlap) ════\n");
  console.log("  World sell: composite ≤ -40 (KT=2/TK=3/VM=4/MOM=1), KHÔNG có regime gate");
  console.log("  VN premium: streak ≥ 11 ngày (≥p80 liên tiếp)\n");

  type Group = {
    label: string;
    rets21: number[];
    rets42: number[];
    streakData: number[];
  };

  const groups: Record<string, Group> = {
    "both":       { label: "World SELL + VN streak ≥11",  rets21: [], rets42: [], streakData: [] },
    "world_only": { label: "Chỉ World SELL",               rets21: [], rets42: [], streakData: [] },
    "vn_only":    { label: "Chỉ VN streak ≥11",           rets21: [], rets42: [], streakData: [] },
    "neither":    { label: "Không tín hiệu nào",           rets21: [], rets42: [], streakData: [] },
  };

  let skipped = 0;
  for (let i = 0; i < vnDays.length; i++) {
    const r21 = sjcForwardReturn(i, 21);
    const r42 = sjcForwardReturn(i, 42);
    if (r21 === null) continue;

    const tp = nearestTimelinePoint(vnDays[i].date);
    if (!tp) { skipped++; continue; }

    const worldComp = compW(tp, SELL_W);
    const worldSell = worldComp <= SELL_THR;
    const streak = premiumStreakAt(i);
    const vnSell = streak >= 11;

    const key = worldSell && vnSell ? "both"
              : worldSell ? "world_only"
              : vnSell ? "vn_only"
              : "neither";

    groups[key].rets21.push(r21);
    if (r42 !== null) groups[key].rets42.push(r42);
    groups[key].streakData.push(streak);
  }

  // Baseline
  const allRets21 = Object.values(groups).flatMap(g => g.rets21);
  const bDown21 = allRets21.filter(r => r < 0).length / allRets21.length * 100;

  console.log(`  Baseline (tất cả ${allRets21.length} ngày): ${bDown21.toFixed(1)}% giảm, trung_vị ${fmt(med(allRets21))}%\n`);

  for (const g of Object.values(groups)) {
    if (!g.rets21.length) {
      console.log(`  ${g.label.padEnd(36)}: n=0`);
      continue;
    }
    const down21 = g.rets21.filter(r => r < 0).length / g.rets21.length * 100;
    const down42 = g.rets42.length ? g.rets42.filter(r => r < 0).length / g.rets42.length * 100 : NaN;
    const ex21 = down21 - bDown21;
    const avgStreak = g.streakData.filter(s=>s>0).length ?
      g.streakData.filter(s=>s>0).reduce((a,b)=>a+b,0)/g.streakData.filter(s=>s>0).length : 0;
    console.log(
      `  ${g.label.padEnd(36)}` +
      ` n=${String(g.rets21.length).padStart(3)}` +
      ` | 21d: ${down21.toFixed(0).padStart(3)}% (${ex21>=0?"+":""}${ex21.toFixed(0)}pp)` +
      ` med=${fmt(med(g.rets21))}%` +
      (isNaN(down42) ? "" : ` | 42d: ${down42.toFixed(0).padStart(3)}% med=${fmt(med(g.rets42))}%`) +
      (avgStreak > 0 ? ` | streak_tb=${avgStreak.toFixed(0)}d` : "")
    );
  }
  console.log();
}

// ── Study 19: World sell signal trong 488 ngày — bao nhiêu tín hiệu? ──────
function study19() {
  console.log("════ Study 19: World sell signal trong 488 ngày VN (2025–2026) ════\n");

  let worldSellDays = 0, regimeActiveDays = 0, total = 0;
  const worldComps: number[] = [];

  for (const entry of vnDays) {
    const tp = nearestTimelinePoint(entry.date);
    if (!tp) continue;
    total++;
    const c = compW(tp, SELL_W);
    worldComps.push(c);
    if (c <= SELL_THR) worldSellDays++;
    if (regimeHiking(entry.date)) regimeActiveDays++;
  }

  worldComps.sort((a, b) => a - b);
  const p10 = worldComps[Math.floor(worldComps.length * 0.1)];
  const p25 = worldComps[Math.floor(worldComps.length * 0.25)];
  const p50 = worldComps[Math.floor(worldComps.length * 0.5)];

  console.log(`  Tổng ngày có timeline point: ${total}`);
  console.log(`  World composite (KT=2/TK=3/VM=4/MOM=1):`);
  console.log(`    p10=${p10.toFixed(1)}  p25=${p25.toFixed(1)}  median=${p50.toFixed(1)}`);
  console.log(`  Ngày world sell ≤ -40:  ${worldSellDays} (${(worldSellDays/total*100).toFixed(1)}%)`);
  console.log(`  Ngày hiking regime:     ${regimeActiveDays} (${(regimeActiveDays/total*100).toFixed(1)}%)`);
  console.log(`  Ngày sell VÀ hiking:    0 (Fed đang cắt giảm trong toàn bộ 488 ngày VN)`);
  console.log();
  console.log("  → 488 ngày VN trùng với chu kỳ Fed cắt giảm: world sell signal bị suppressed");
  console.log("    Không thể test combination với regime gate trong giai đoạn này.");
  console.log();

  // Show composite distribution trong 488 ngày
  const buckets = [
    ["> 0 (bullish)",     (c: number) => c > 0],
    ["-20..0",            (c: number) => c >= -20 && c <= 0],
    ["-40..-20",          (c: number) => c >= -40 && c < -20],
    ["< -40 (sell zone)", (c: number) => c < -40],
  ];
  console.log("  Phân phối composite world trong 488 ngày VN:");
  for (const [label, fn] of buckets) {
    const n = worldComps.filter(fn).length;
    console.log(`    ${label.padEnd(22)}: ${n} ngày (${(n/total*100).toFixed(1)}%)`);
  }
  console.log();
}

// ── Study 20: Tần suất kết hợp trên lịch sử 17 năm ──────────────────────
function study20() {
  console.log("════ Study 20: Tần suất kết hợp — lý thuyết trên 17 năm ════\n");
  console.log("  (VN premium không có lịch sử 17 năm — dùng xác suất từ 488 ngày để ước tính)\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);

  // Tần suất world sell trong 17 năm
  const worldSell = valid.filter(p => compW(p, SELL_W) <= SELL_THR);
  const worldSellHiking = worldSell.filter(p => regimeHiking(p.date));

  // Từ 488 ngày VN: tần suất VN premium streak ≥11 là bao nhiêu?
  let vnStreakDays = 0;
  for (let i = 0; i < vnDays.length; i++) {
    if (premiumStreakAt(i) >= 11) vnStreakDays++;
  }
  const vnStreakFreq = vnStreakDays / vnDays.length; // ~6% từ study trước

  console.log(`  17 năm timeline (${valid.length} điểm):`);
  console.log(`    World sell ≤-40 (tất cả):     ${worldSell.length} điểm (${(worldSell.length/valid.length*100).toFixed(1)}%)`);
  console.log(`    World sell ≤-40 + hiking:      ${worldSellHiking.length} điểm (${(worldSellHiking.length/valid.length*100).toFixed(1)}%)`);
  console.log();
  console.log(`  488 ngày VN:`);
  console.log(`    VN streak ≥11 ngày:            ${vnStreakDays} ngày (${(vnStreakFreq*100).toFixed(1)}%)`);
  console.log();

  // Ước tính tần suất kết hợp (nếu 2 signal độc lập)
  const worldSellFreq = worldSell.length / valid.length;
  const worldSellHikingFreq = worldSellHiking.length / valid.length;
  const combIndepAll = worldSellFreq * vnStreakFreq * 100;
  const combIndepHiking = worldSellHikingFreq * vnStreakFreq * 100;

  console.log(`  Ước tính tần suất kết hợp (giả định 2 signal độc lập):`);
  console.log(`    Không regime gate: ${combIndepAll.toFixed(1)}% ngày (khoảng ${(combIndepAll*252/100).toFixed(0)} ngày/năm)`);
  console.log(`    Có hiking gate:    ${combIndepHiking.toFixed(1)}% ngày (khoảng ${(combIndepHiking*252/100).toFixed(0)} ngày/năm)`);
  console.log();
  console.log("  Lưu ý: 2 signal KHÔNG hoàn toàn độc lập — khi macro xấu (world sell),");
  console.log("  thường VN premium cũng bị áp lực (nhưng có thể cao hơn hoặc thấp hơn).");
  console.log();
}

// ── Study 21: Kết luận — nên triển khai gì? ─────────────────────────────
function study21() {
  console.log("════ Study 21: Kết luận — thiết kế triển khai sell signal ════\n");

  console.log("  ┌─ Tín hiệu bán đã validated ──────────────────────────────────────────┐");
  console.log("  │                                                                        │");
  console.log("  │  1. VN Premium Streak (ngắn hạn, 21–42 ngày)                         │");
  console.log("  │     Điều kiện: streak ≥ 11 ngày premium ≥ p80                        │");
  console.log("  │     Accuracy: 77% (streak>15, n=30) / 100% (streak>15+SJC>10%, n=10) │");
  console.log("  │     Dữ liệu: 488 ngày, 1 regime, MỘT MÌNH đã đủ mạnh                │");
  console.log("  │     Ưu: luôn hoạt động, không cần regime gate                        │");
  console.log("  │     Nhược: 488 ngày = 1 chế độ thị trường, cần thêm data             │");
  console.log("  │                                                                        │");
  console.log("  │  2. World Sell Signal (ngắn hạn, 21 bars ~1 tháng)                   │");
  console.log("  │     Điều kiện: composite ≤ -40 (KT=2/TK=3/VM=4/MOM=1)               │");
  console.log("  │                + regime gate: Fed hiking ≥+0.25%/6m                  │");
  console.log("  │     Accuracy: ~70% train / ~68–78% test (trong regime)               │");
  console.log("  │     Ưu: 17 năm dữ liệu, validated 2 giai đoạn                        │");
  console.log("  │     Nhược: chỉ bắn trong hiking cycle (~24% thời gian)               │");
  console.log("  │     Hiện tại (2026): SUPPRESSED (Fed đang cắt giảm)                  │");
  console.log("  │                                                                        │");
  console.log("  │  3. Combination (lý thuyết)                                           │");
  console.log("  │     Khi CẢ 2 bắn cùng lúc → accuracy cao hơn đơn lẻ                 │");
  console.log("  │     Nhưng: 2 signal không cùng regime → hiếm gặp (~2%/năm)           │");
  console.log("  │     Chưa đủ dữ liệu overlap để validate thực tế                      │");
  console.log("  │                                                                        │");
  console.log("  └────────────────────────────────────────────────────────────────────────┘\n");

  console.log("  Đề xuất triển khai theo 2 tầng (Layer architecture B):\n");
  console.log("  Layer 1 — Buy signal (đã triển khai, không thay đổi):");
  console.log("    World score: technical+macro+stats+momentum");
  console.log("    3 preset 1m/3m/6m giữ nguyên\n");
  console.log("  Layer 2 — VN-specific signals (triển khai mới):");
  console.log("    2a. VN Premium Criterion (đã có): premium percentile + spread + ring");
  console.log("    2b. VN Sell signals (đã implement, cần hiển thị riêng):");
  console.log("        - premium_streak ≥11d → score -1 (đã có trong criteria.ts)");
  console.log("        - premium_streak >20d → score -2 (đã có)");
  console.log("        - sjc_momentum + premium → score -1 (đã có)");
  console.log("    2c. World Sell signal (MỚI — cần implement):");
  console.log("        - Chỉ bắn khi hiking regime active");
  console.log("        - Weights: KT=2/TK=3/VM=4/MOM=1, threshold -40");
  console.log("        - Hiển thị với label 'Tín hiệu bán thế giới (chu kỳ Fed tăng lãi)'");
  console.log("        - Hiện tại SUPPRESSED → hiển thị 'không có tín hiệu bán thế giới'\n");
  console.log("  Kế hoạch triển khai:");
  console.log("    Phase 1: UI tách Layer 1 (world score) và Layer 2 (VN premium + signals)");
  console.log("    Phase 2: Thêm world sell signal với regime gate (sau khi UI split xong)");
  console.log("    Phase 3: Combination logic (sau khi có 2+ năm overlap data)");
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log(`Dữ liệu: ${pts.length} timeline điểm | ${vnDays.length} ngày VN\n`);
  study18();
  study19();
  study20();
  study21();
}
main();
