/**
 * P1-1b-detrend, vòng 2 — ABLATION: bỏ tín hiệu `season` khỏi tiêu chí `stats` có làm
 * 3 preset ĐANG PHÁT HÀNH tệ hơn không?
 *
 * Vì sao cần vòng 2: `seasonality-detrend-study.ts` đo 9 biến thể ngưỡng (tuyệt đối /
 * de-trend / xếp hạng) × 3 kỳ hạn = 27 ô, **0 ô qua cổng** — và ô không qua bao gồm cả
 * `abs2` đang phát hành (phía mua của nó KHÔNG vượt placebo chọn ngẫu nhiên cùng số tháng).
 * Câu đó là "không biến thể nào TỐT HƠN", chưa phải "signal vô dụng": season chỉ là 1/4
 * tín hiệu con của `stats`, và `stats` chỉ là 0,1–0,2 trọng số preset. Script này trả lời
 * đúng câu còn thiếu: giữ vs bỏ, đo trên trục mà UI thật dùng (presetComposite).
 *
 * Cách bỏ: `stats` = trung bình các tín hiệu con khả dụng (criteria.ts finish()). Bản
 * "bỏ season" = trung bình 3 tín hiệu còn lại (pct1y/pct3y/vol) — KHÔNG sửa criteria.ts,
 * tính lại từ mảng `signals` mà statsCriterion đã trả về.
 *
 * CỔNG QUYẾT ĐỊNH (viết TRƯỚC khi xem số):
 *   - Bỏ season làm fav TỆ HƠN >1pt ở BẤT KỲ preset × giai đoạn nào ⇒ season mang thông
 *     tin ⇒ GIỮ nguyên (kể cả khi không biến thể nào cải thiện được nó).
 *   - Bỏ season làm fav đổi trong ±1pt mọi ô ⇒ season là nhiễu có trọng số ⇒ ứng viên bỏ,
 *     nhưng phải nêu rõ đây là kết quả TRUNG TÍNH, không phải "cải thiện".
 *   - Bỏ season làm fav TỐT HƠN >1pt ở mọi ô cùng dấu 2 giai đoạn ⇒ đề xuất bỏ.
 * Số tín hiệu (n) cũng phải báo: đổi ngưỡng làm đổi tập ngày, n rơi dưới 25 thì vô hiệu.
 *
 * Lưới THƯA STEP=3 (chống pseudo-replication) + CI block-bootstrap block=H/STEP.
 *
 * Chạy: npx tsx scripts/seasonality-ablation.ts
 */
import assert from "node:assert/strict";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";
import { statsCriterion } from "../src/lib/criteria";
import { blockBootstrapCi } from "../src/lib/indicators";
import { PRESETS, presetComposite, type ScoreMap } from "../src/lib/types";
import { runBacktest } from "./backtest";
import { SPLIT_DATE, MIN_SIGNALS } from "./study-lib";

const STEP = 3;

const fav = (rets: number[]) =>
  rets.length === 0 ? 0 : (rets.filter((r) => r > 0).length / rets.length) * 100;

async function main() {
  const [xau, dxy, fed, y10] = await Promise.all([
    fetchXau(),
    fetchDxy(),
    fetchFedFunds(),
    fetchYield10y(),
  ]);
  if (!dxy || !fed || !y10) throw new Error("thiếu nguồn (cần mạng cho DXY/Fed/yield)");

  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const idxOf = new Map(dates.map((d, i) => [d, i]));

  // Timeline chuẩn = đúng engine đang phát hành (đã walk-forward sau bản sửa #10).
  const { timeline } = runBacktest(xau.bars, dxy.bars, fed, [21, 63, 126], {
    yield10y: { bars: y10.bars, real: y10.real },
    momentum12m: true,
  });
  console.log(`timeline ${timeline.points.length} điểm: ${timeline.points[0].date} .. ${timeline.points[timeline.points.length - 1].date}`);

  // Lưới thưa + điểm stats bản "bỏ season".
  interface Row {
    date: string;
    scores: ScoreMap;
    scoresNo: ScoreMap;
    returns: Record<string, number | null>;
  }
  const rows: Row[] = [];
  let seasonAvail = 0;
  for (let k = 0; k < timeline.points.length; k += STEP) {
    const p = timeline.points[k];
    const i = idxOf.get(p.date);
    if (i === undefined) continue;
    const res = statsCriterion(closes.slice(0, i + 1), dates.slice(0, i + 1));
    const avail = res.signals.filter((s) => s.available);
    const others = avail.filter((s) => s.id !== "season");
    if (avail.length !== others.length) seasonAvail++;
    // Giữ nguyên phép tính của finish(): trung bình các tín hiệu khả dụng, clamp ±2.
    const statsNo = others.length
      ? Math.max(-2, Math.min(2, others.reduce((a, s) => a + s.score, 0) / others.length))
      : 0;
    // Kiểm bản "giữ" tự tính khớp điểm engine — nếu lệch thì phép tái tạo sai, dừng.
    const statsYes = avail.length
      ? Math.max(-2, Math.min(2, avail.reduce((a, s) => a + s.score, 0) / avail.length))
      : 0;
    assert.ok(
      Math.abs(statsYes - ((p.scores as ScoreMap).stats ?? 0)) < 1e-9,
      `stats tái tạo lệch tại ${p.date}: ${statsYes} vs ${(p.scores as ScoreMap).stats}`
    );
    rows.push({
      date: p.date,
      scores: p.scores as ScoreMap,
      scoresNo: { ...(p.scores as ScoreMap), stats: statsNo },
      returns: p.returns as Record<string, number | null>,
    });
  }
  assert.ok(rows.length > 400, `quá ít quan sát: ${rows.length}`);
  console.log(`lưới thưa STEP=${STEP}: ${rows.length} quan sát, season khả dụng ${seasonAvail}\n`);

  console.log("ABLATION theo preset (phía MUA, ngưỡng preset đang phát hành)");
  console.log("preset | giai đoạn | GIỮ season           | BỎ season            | Δfav   | Δn");
  let anyWorse = false;
  let anyBetter = false;
  let anyThin = false;

  for (const preset of PRESETS) {
    const h = String(preset.horizonDays);
    const usable = rows.filter((r) => r.returns[h] !== null);
    for (const era of ["train", "test"] as const) {
      const set = usable.filter((r) =>
        era === "train" ? r.date < SPLIT_DATE : r.date >= SPLIT_DATE
      );
      const base = fav(set.map((r) => r.returns[h] as number));
      const pick = (key: "scores" | "scoresNo") =>
        set
          .filter((r) => presetComposite(r[key], preset) >= preset.buyThreshold)
          .map((r) => r.returns[h] as number);
      const yes = pick("scores");
      const no = pick("scoresNo");
      const fYes = fav(yes);
      const fNo = fav(no);
      const d = fNo - fYes;
      if (d < -1) anyWorse = true;
      if (d > 1) anyBetter = true;
      if (yes.length < MIN_SIGNALS || no.length < MIN_SIGNALS) anyThin = true;
      const ci = (r: number[], block: number) => {
        const c = blockBootstrapCi(r, block);
        return c ? `[${c[0].toFixed(0)}-${c[1].toFixed(0)}]` : "[--]";
      };
      const block = Math.max(1, Math.ceil(preset.horizonDays / STEP));
      console.log(
        `${preset.id.padEnd(6)} | ${era.padEnd(9)} | ` +
          `${fYes.toFixed(1)}% n=${String(yes.length).padStart(4)} ${ci(yes, block)} | ` +
          `${fNo.toFixed(1)}% n=${String(no.length).padStart(4)} ${ci(no, block)} | ` +
          `${(d >= 0 ? "+" : "") + d.toFixed(1)}pt`.padEnd(7) +
          ` | ${no.length - yes.length >= 0 ? "+" : ""}${no.length - yes.length}` +
          `   (baseline ${base.toFixed(1)}%)`
      );
    }
  }

  console.log();
  const verdict = anyWorse
    ? "GIỮ season — bỏ nó làm tệ hơn >1pt ở ít nhất một preset × giai đoạn."
    : anyBetter
      ? "ỨNG VIÊN BỎ — bỏ season tốt hơn >1pt ở ít nhất một ô và không ô nào tệ hơn >1pt."
      : "TRUNG TÍNH — mọi ô đổi trong ±1pt: season không mang thông tin đo được ở trục preset.";
  console.log(`PHÁN QUYẾT: ${verdict}`);
  if (anyThin) console.log("CẢNH BÁO: có ô n < 25 — ô đó không kết luận được.");
}

void main();
