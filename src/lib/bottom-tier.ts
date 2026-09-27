/**
 * Săn đáy hiển thị theo BẬC (bin điểm đáy), không theo %. Spec:
 * docs/superpowers/specs/2026-09-25-bottom-tier-display-design.md
 *
 * Vì sao: `prob` bị hiệu chuẩn ngược ở vùng cao (walk-forward: máy nói 60–80% thì đúng
 * 26%) — con số phản ánh chế độ thị trường, không phải độ chắc chắn. Không phương án %
 * nào thắng Brier ở CẢ HAI giai đoạn. Nhưng THỨ HẠNG bin giữ vững cả hai: bin 3 trên nền,
 * bin 0–1 dưới nền. Nên hiển thị bậc + nền để người đọc tự so, không in %.
 *
 * Lớp hiển thị thuần: không đụng engine đáy, nhãn, trọng số, `bottomHistory`.
 */
import { BOTTOM_CONFIG, type TimelinePoint } from "./types";
import { labelNearBottom } from "./bottom";
import { bearPhases, isCrashDisplayMode, trailingDrawdownPct } from "./bear-dca";

export type BottomTier = "high" | "normal" | "low";

export const BOTTOM_TIER_LABEL: Record<BottomTier, string> = {
  high: "Cao hơn bình thường",
  normal: "Ngang mức bình thường",
  low: "Thấp hơn bình thường",
};

/** lớp màu CSS theo bậc (tái dùng lớp buy/neutral/sell sẵn có) */
export const TIER_CLASS: Record<BottomTier, "buy" | "neutral" | "sell"> = {
  high: "buy",
  normal: "neutral",
  low: "sell",
};

/** bin cao nhất của binEdges [-40,0,40] ⇒ 3. Khớp HIGH_CONFIDENCE_BIN của fusion. */
const TOP_BIN = BOTTOM_CONFIG.cycle.binEdges.length;

/**
 * Bậc hiển thị. Đang sụp nhanh ⇒ bậc `high` HẠ xuống `normal`: đo được bin 3 lúc sụp
 * nhanh chỉ ngang nền (train 33,3% vs nền 27,5%, 5 đợt) trong khi lúc êm là 48,1% vs 31,3%.
 */
export function bottomTierOf(bin: number | null | undefined, crash: boolean): BottomTier {
  if (bin == null) return "normal";
  if (bin >= TOP_BIN) return crash ? "normal" : "high";
  if (bin === TOP_BIN - 1) return "normal";
  return "low";
}

/** Bằng chứng một bậc trong một giai đoạn: tỉ lệ đúng, tỉ lệ nền, số đợt độc lập. */
export interface TierEraStat {
  favPct: number;
  basePct: number;
  n: number;
  clusters: number;
}
export type TierEvidence = Record<"cycle" | "swing", Record<BottomTier, { train: TierEraStat; test: TierEraStat }>>;

const SPLIT = "2019-01-01";
const STEP = 3;
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Tính MỖI LẦN CRON (scripts/run.ts → bottom.json.tierEvidence), không phải hằng số cứng:
 * mỗi ngày cron gắn nhãn thêm một ngày cũ nên n/nền của bậc normal/low đổi vài ngày một lần
 * — một hằng số khóa bằng test sẽ fail định kỳ và bắn Telegram vô ích (Fable review).
 *
 * Tỉ lệ near-bottom theo bậc, tách train/test, trên lưới thưa STEP phiên (cùng quy ước
 * chống pseudo-replication với backtest/bottom). Cụm = khối H phiên cố định. Bậc lấy qua
 * CHÍNH `bottomTierOf` + cổng sụp nhanh as-of ⇒ bằng chứng đo đúng thứ đang hiển thị.
 */
export function computeTierEvidence(points: TimelinePoint[]): TierEvidence {
  const prices = points.map((p) => p.price);
  // bearPhases ≡ bearDcaAt từng ngày (golden-tested) nhưng O(n) thay vì O(n²)
  const phases = bearPhases(prices);
  const crash = points.map((_, i) => isCrashDisplayMode(phases[i], trailingDrawdownPct(prices, i)));
  const out = {} as TierEvidence;
  for (const t of ["cycle", "swing"] as const) {
    const cfg = BOTTOM_CONFIG[t];
    const key = t === "cycle" ? "cycleBin" : "swingBin";
    const rows: { i: number; test: boolean; tier: BottomTier; ok: boolean }[] = [];
    for (let i = 0; i < points.length; i += STEP) {
      const bin = points[i][key];
      const ok = labelNearBottom(prices, i, cfg.horizonDays, cfg.epsPct);
      if (bin == null || ok === null) continue;
      rows.push({ i, test: points[i].date >= SPLIT, tier: bottomTierOf(bin, crash[i]), ok });
    }
    const stat = (test: boolean, tier: BottomTier): TierEraStat => {
      const era = rows.filter((r) => r.test === test);
      const s = era.filter((r) => r.tier === tier);
      const pct = (a: typeof rows) => (a.length ? (a.filter((r) => r.ok).length / a.length) * 100 : 0);
      return {
        favPct: r1(pct(s)),
        basePct: r1(pct(era)),
        n: s.length,
        clusters: new Set(s.map((r) => Math.floor(r.i / cfg.horizonDays))).size,
      };
    };
    out[t] = {
      high: { train: stat(false, "high"), test: stat(true, "high") },
      normal: { train: stat(false, "normal"), test: stat(true, "normal") },
      low: { train: stat(false, "low"), test: stat(true, "low") },
    };
  }
  return out;
}

/** Câu bằng chứng cho một bậc, tiếng Việt, hai giai đoạn tách rời. */
export function tierEvidenceText(e: { train: TierEraStat; test: TierEraStat }): string {
  const f = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  return (
    `lịch sử bậc này đúng ${f(e.train.favPct)}% (2009–2018) / ${f(e.test.favPct)}% (2019–2026), ` +
    `so với nền ${f(e.train.basePct)}% / ${f(e.test.basePct)}% — ${e.train.clusters}/${e.test.clusters} đợt độc lập`
  );
}
