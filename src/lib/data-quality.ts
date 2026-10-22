/**
 * Chất lượng đầu vào — MỘT nguồn sự thật cho ngưỡng tuổi, dùng chung bởi
 * `summary.json.dataQuality` (Hermes đọc) và cảnh báo Telegram (`scripts/notify.ts`).
 *
 * Vì sao có: 2026-09-28..10-22 giá nhẫn null 25 ngày và Fed kẹt nhãn 2026-09-01 mà
 * không ai biết — cảnh báo chỉ là chuỗi tự do nằm trong analysis.json.
 */
export type DataInputKey = "xau" | "dxy" | "yield10y" | "fed" | "sjc" | "ring" | "usdVnd";

const KEYS: DataInputKey[] = ["xau", "dxy", "yield10y", "fed", "sjc", "ring", "usdVnd"];

/** Ngày dương lịch tối đa trước khi coi là cũ. VN 4 ngày: Tết/lễ dài; Fed 45: số tháng
 *  công bố ~ngày 1 tháng sau (nhãn đã dời sang ngày khả dụng, xem fetchFedFunds). */
export const MAX_AGE_DAYS: Record<DataInputKey, number> = {
  xau: 5,
  dxy: 5,
  yield10y: 5,
  fed: 45,
  sjc: 4,
  ring: 2,
  usdVnd: 4,
};

const LABELS: Record<DataInputKey, string> = {
  xau: "giá vàng thế giới (XAU)",
  dxy: "chỉ số USD (DXY)",
  yield10y: "lợi suất Mỹ 10 năm",
  fed: "lãi suất Fed",
  sjc: "giá SJC",
  ring: "giá nhẫn",
  usdVnd: "tỷ giá USD/VND",
};

export type InputDates = Partial<Record<DataInputKey, { date: string | null; source: string }>>;

export interface DataQualityItem {
  asOfDate: string | null;
  source: string;
  ageDays: number | null;
  maxAgeDays: number;
  status: "ok" | "stale" | "missing";
}

export type DataQuality = Record<DataInputKey, DataQualityItem>;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function lastDateWhere<T extends { date: string }>(rows: T[], ok: (r: T) => boolean): string | null {
  for (let i = rows.length - 1; i >= 0; i--) if (ok(rows[i])) return rows[i].date;
  return null;
}

export function assessDataQuality(inputs: InputDates, today: string): DataQuality {
  const out = {} as DataQuality;
  for (const k of KEYS) {
    const inp = inputs[k];
    const asOfDate = inp?.date ?? null;
    const ageDays = asOfDate === null ? null : daysBetween(asOfDate, today);
    out[k] = {
      asOfDate,
      source: inp?.source ?? "none",
      ageDays,
      maxAgeDays: MAX_AGE_DAYS[k],
      status: ageDays === null ? "missing" : ageDays > MAX_AGE_DAYS[k] ? "stale" : "ok",
    };
  }
  return out;
}

/** Tin Telegram chỉ khi trạng thái ĐỔI (hỏng 1 tin, phục hồi 1 tin) — cron chạy mỗi giờ. */
export function dataQualityTransitions(
  prev: Record<string, string>,
  dq: DataQuality
): { lines: string[]; state: Record<string, string> } {
  const lines: string[] = [];
  const state: Record<string, string> = {};
  for (const k of KEYS) {
    const key = `data:${k}`;
    const { status, asOfDate, ageDays } = dq[k];
    state[key] = status;
    const was = prev[key] ?? "ok";
    if (status !== "ok" && was === "ok") {
      lines.push(
        status === "missing"
          ? `🔴 Mất dữ liệu ${LABELS[k]}: không có giá trị nào.`
          : `🔴 Dữ liệu ${LABELS[k]} đã cũ ${ageDays} ngày (mốc ${asOfDate}). Kiểm nguồn / máy sync.`
      );
    } else if (status === "ok" && was !== "ok") {
      lines.push(`✅ Dữ liệu ${LABELS[k]} đã có lại (mốc ${asOfDate}).`);
    }
  }
  return { lines, state };
}

/** Số phiên quá khứ Yahoo đã sửa > tolPct so với timeline lần trước. Bỏ 2 điểm cuối của
 *  bản cũ: phiên đang chạy và phiên vừa đóng (settlement còn chốt lại). */
export function countRevisions(
  prev: { date: string; price: number }[],
  bars: { date: string; close: number }[],
  tolPct = 0.5
): number {
  if (prev.length < 3) return 0;
  const cutoff = prev[prev.length - 2].date;
  const fresh = new Map(bars.map((b) => [b.date, b.close]));
  let n = 0;
  for (const p of prev) {
    if (p.date >= cutoff) break;
    const c = fresh.get(p.date);
    if (c !== undefined && (Math.abs(c - p.price) / p.price) * 100 > tolPct) n++;
  }
  return n;
}
