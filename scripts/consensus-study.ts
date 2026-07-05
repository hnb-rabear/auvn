/**
 * Consensus study — KIỂM CHỨNG phương án thay thế cho chế độ "Toàn cảnh"
 * (trọng số mặc định 35/25/20/20, chưa từng qua tuyển chọn).
 *
 * Ba phần:
 *   1 — HIỆN TRẠNG: đo thẳng cấu hình mặc định trên timeline (mua + bán, train/test)
 *       để ghi hồ sơ "vì sao phải thay" bằng số liệu, không phải cảm nhận.
 *   2 — HƯỚNG B (tối ưu trọng số "một cấu hình cho mọi kỳ hạn"): grid search 4D
 *       như presets-study nhưng đòi MỘT cấu hình thắng baseline ở CẢ 3 kỳ hạn ×
 *       2 giai đoạn (6 ô). Câu hỏi cần đóng: cấu hình "toàn cảnh tối ưu" có khác
 *       gì preset macro-nặng đã có không, hay chỉ là preset thứ 4 trùng lặp?
 *   3 — HƯỚNG A (đồng thuận preset): ngày có ≥k/3 preset trong vùng mua. Vì 3
 *       preset đều macro-nặng (tương quan cao), nghi vấn lớn nhất là đồng thuận
 *       KHÔNG thêm thông tin so với một preset đơn lẻ → placebo đồng-n: so với
 *       "chỉ siết/nới ngưỡng của preset đúng kỳ hạn cho cùng cỡ mẫu" (top-n theo
 *       composite preset đó). Đồng thuận chỉ được CLAIM lợi thế riêng nếu vượt
 *       placebo; nếu không, UI chỉ được trình bày nó như phép ĐẾM hiển thị
 *       (mỗi preset giữ evidence riêng đã kiểm chứng), không claim edge mới.
 *
 * Khung kiểm chứng (đồng bộ presets-study / fusion-study, chống overfit):
 *   - Offline trên public/data/timeline.json đã commit. KHÔNG fetch.
 *   - Chia train <2019 / test ≥2019. "Đúng" = lợi suất H phiên sau tín hiệu > 0.
 *   - excess = precision − baseline (mua ngày bất kỳ); min-excess = min(train,test).
 *   - CI 95% block-bootstrap (block = H/3) vì lưới DÀY ⇒ tín hiệu bắn chùm.
 *
 * Chạy: npx tsx scripts/consensus-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline, TimelinePoint } from "../src/lib/types";
import { PRESETS, DEFAULT_WEIGHTS } from "../src/lib/types";
import { composite, stats, blockBootstrapCi, SPLIT_DATE, MIN_SIGNALS, type H } from "./study-lib";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const PTS = tl.points;
const HS: H[] = ["21", "63", "126"];
const pct = (x: number) => (x * 100).toFixed(1);

function seg(pts: TimelinePoint[], h: H): { tr: TimelinePoint[]; te: TimelinePoint[]; baseTr: number; baseTe: number } {
  const ok = pts.filter((p) => p.returns[h] !== null);
  const tr = ok.filter((p) => p.date < SPLIT_DATE);
  const te = ok.filter((p) => p.date >= SPLIT_DATE);
  return {
    tr,
    te,
    baseTr: stats(tr.map((p) => p.returns[h] as number)).fav,
    baseTe: stats(te.map((p) => p.returns[h] as number)).fav,
  };
}

function line(label: string, set: TimelinePoint[], h: H, base: number, withCi = false): { n: number; fav: number; ex: number } {
  const rets = set.map((p) => p.returns[h] as number);
  const s = stats(rets);
  const ci = withCi ? blockBootstrapCi(rets, Math.max(1, Math.round(Number(h) / 3))) : null;
  console.log(
    `  ${label.padEnd(24)} n=${String(s.n).padStart(4)} fav=${pct(s.fav)}% ex=${s.fav - base >= 0 ? "+" : ""}${pct(s.fav - base)}pt med=${s.med.toFixed(1)}%${ci ? ` CI[${ci[0]}–${ci[1]}]` : ""}`
  );
  return { n: s.n, fav: s.fav, ex: s.fav - base };
}

// ============ 1 — HIỆN TRẠNG cấu hình mặc định ============
function part1() {
  console.log("########## 1 — HIỆN TRẠNG 'Toàn cảnh' (mặc định 35/25/20/20, ngưỡng ±40) ##########");
  console.log("(timeline chỉ có tiêu chí thế giới nên premium tự rơi khỏi mẫu — đúng như backtest đang chạy)");
  const W = DEFAULT_WEIGHTS as unknown as Record<string, number>;
  for (const h of HS) {
    const { tr, te, baseTr, baseTe } = seg(PTS, h);
    console.log(`\n----- KỲ HẠN ${h} phiên (baseline tr ${pct(baseTr)}% / te ${pct(baseTe)}%) -----`);
    line("MUA ≥+40 (train)", tr.filter((p) => composite(p, W) >= 40), h, baseTr);
    line("MUA ≥+40 (test)", te.filter((p) => composite(p, W) >= 40), h, baseTe, true);
    // phía bán: "đúng" của tín hiệu bán = giá GIẢM, nên fav ở đây là % giá tăng — đọc ngược
    const sellTr = tr.filter((p) => composite(p, W) <= -40);
    const sellTe = te.filter((p) => composite(p, W) <= -40);
    const st = stats(sellTr.map((p) => p.returns[h] as number));
    const se = stats(sellTe.map((p) => p.returns[h] as number));
    console.log(
      `  BÁN ≤−40:                train n=${st.n} giá-tăng=${pct(st.fav)}% med=${st.med.toFixed(1)}% | test n=${se.n} giá-tăng=${pct(se.fav)}% med=${se.med.toFixed(1)}% (tín hiệu bán "đúng" khi giá GIẢM)`
    );
  }
}

// ============ 2 — HƯỚNG B: một cấu hình cho mọi kỳ hạn ============
interface MultiCand {
  w: Record<string, number>;
  thr: number;
  cells: { h: H; trFav: number; trN: number; teFav: number; teN: number; exTr: number; exTe: number }[];
  minEx: number;
}
function part2() {
  console.log("\n\n########## 2 — HƯỚNG B: grid search MỘT cấu hình thắng baseline cả 3 kỳ hạn × 2 giai đoạn ##########");
  const segs = Object.fromEntries(HS.map((h) => [h, seg(PTS, h)])) as Record<H, ReturnType<typeof seg>>;
  const cands: MultiCand[] = [];
  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
        const wm = 10 - wt - ws - wmom;
        const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 };
        for (const thr of [30, 40, 50, 60]) {
          const cells: MultiCand["cells"] = [];
          let ok = true;
          for (const h of HS) {
            const { tr, te, baseTr, baseTe } = segs[h];
            const trS = stats(tr.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
            const teS = stats(te.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
            if (trS.n < MIN_SIGNALS || teS.n < MIN_SIGNALS || trS.fav <= baseTr || teS.fav <= baseTe) {
              ok = false;
              break;
            }
            cells.push({ h, trFav: trS.fav, trN: trS.n, teFav: teS.fav, teN: teS.n, exTr: trS.fav - baseTr, exTe: teS.fav - baseTe });
          }
          if (!ok) continue;
          const minEx = Math.min(...cells.flatMap((c) => [c.exTr, c.exTe]));
          cands.push({ w, thr, cells, minEx });
        }
      }
  cands.sort((a, b) => b.minEx - a.minEx);
  console.log(`${cands.length} cấu hình qua cổng 6 ô. Top 5 theo min-excess (tệ nhất trong 6 ô):`);
  for (const c of cands.slice(0, 5)) {
    console.log(
      `  KT:${c.w.technical} TK:${c.w.stats} VM:${c.w.macro} MOM:${c.w.momentum} thr=${c.thr} | minEx +${pct(c.minEx)}pt | ` +
        c.cells.map((x) => `H${x.h}: tr ${pct(x.trFav)}%(n=${x.trN}) te ${pct(x.teFav)}%(n=${x.teN})`).join(" | ")
    );
  }
  if (cands.length) {
    const b = cands[0];
    const macroHeavy = b.w.macro >= 0.6;
    console.log(
      `→ Cấu hình tốt nhất ${macroHeavy ? "MACRO-NẶNG (VM=" + b.w.macro + ") — hội tụ về cùng họ với preset 3m/6m, KHÔNG mang thông tin mới" : "khác họ preset hiện có — đáng xem xét thêm"}.`
    );
  } else {
    console.log("→ KHÔNG cấu hình nào thắng baseline ở cả 6 ô — không tồn tại 'toàn cảnh tối ưu' một-composite.");
  }
}

// ============ 3 — HƯỚNG A: đồng thuận preset ============
function nBuy(p: TimelinePoint): number {
  return PRESETS.filter((pr) => composite(p, pr.weights as unknown as Record<string, number>) >= pr.buyThreshold).length;
}
function part3() {
  console.log("\n\n########## 3 — HƯỚNG A: đồng thuận preset (≥k/3 preset trong vùng MUA) ##########");
  for (const h of HS) {
    const preset = PRESETS.find((p) => String(p.horizonDays) === h)!;
    const W = preset.weights as unknown as Record<string, number>;
    const { tr, te, baseTr, baseTe } = seg(PTS, h);
    console.log(`\n----- KỲ HẠN ${h} phiên (preset gốc: ${preset.id}) — baseline tr ${pct(baseTr)}% / te ${pct(baseTe)}% -----`);
    line(`preset ${preset.id} (tham chiếu, train)`, tr.filter((p) => composite(p, W) >= preset.buyThreshold), h, baseTr);
    line(`preset ${preset.id} (tham chiếu, test)`, te.filter((p) => composite(p, W) >= preset.buyThreshold), h, baseTe, true);
    for (const k of [1, 2, 3]) {
      const trK = tr.filter((p) => nBuy(p) >= k);
      const teK = te.filter((p) => nBuy(p) >= k);
      const rTr = line(`≥${k}/3 preset MUA (train)`, trK, h, baseTr);
      const rTe = line(`≥${k}/3 preset MUA (test)`, teK, h, baseTe, true);

      // placebo đồng-n: top-n ngày theo composite CỦA PRESET KỲ HẠN NÀY —
      // tương đương chỉ nới/siết ngưỡng preset gốc để có cùng cỡ mẫu.
      for (const [lab, segPts, r] of [["train", tr, rTr], ["test", te, rTe]] as const) {
        const top = [...segPts].sort((a, b) => composite(b, W) - composite(a, W)).slice(0, r.n);
        const sTop = stats(top.map((p) => p.returns[h] as number));
        const d = (r.fav - sTop.fav) * 100;
        console.log(
          `      placebo đồng-n ${lab}: top-${r.n} theo composite ${preset.id} → fav=${pct(sTop.fav)}% ⇒ đồng thuận ${d > 0 ? "THÊM +" + d.toFixed(1) + "pt" : "KHÔNG thêm (" + d.toFixed(1) + "pt)"}`
        );
      }
    }
  }
  console.log(
    "\n→ Đọc kết quả: nếu đồng thuận không vượt placebo đồng-n, KHÔNG được claim 'đồng thuận chính xác hơn' —\n" +
      "  UI chỉ được dùng phép đếm k/3 như tóm tắt hiển thị của 3 preset đã kiểm chứng riêng lẻ."
  );
}

console.log(`Consensus study — timeline ${PTS.length} điểm (${PTS[0].date} → ${PTS[PTS.length - 1].date}), lưới DÀY step=1, split ${SPLIT_DATE}.\n`);
part1();
part2();
part3();
