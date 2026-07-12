/** Toán chart chính (PriceChart) — 1 trục giá chung USD/oz: XAU/USD (đầy đủ lịch sử, không cắt)
 *  + SJC quy đổi sang USD/oz-tương-đương bằng tỷ giá ngày đó, để so sánh trực tiếp trên cùng
 *  1 trục — thay vì mỗi đường tự co giãn riêng (gây ảo giác "SJC thấp hơn thế giới",
 *  spec 2026-07-11). XAU/USD KHÔNG bị rút ngắn theo phạm vi dữ liệu VN — chỉ đường SJC mới bị
 *  giới hạn bởi vùng có usdVnd theo ngày (giống giới hạn dữ liệu SJC vốn đã có từ trước). */
import type { TimelinePoint, VnGoldEntry } from "./types";

export const POINTS_PER_MONTH = 21;
export const MIN_SPAN = 14;
const TROY_OZ_GRAMS = 31.1034768;
const LUONG_GRAMS = 37.5;

export const RANGES: { label: string; months: number | null }[] = [
  { label: "1T", months: 1 },
  { label: "3T", months: 3 },
  { label: "6T", months: 6 },
  { label: "1N", months: 12 },
  { label: "3N", months: 36 },
  { label: "Tất cả", months: null },
];

/** Cửa sổ mặc định neo về phiên mới nhất. */
export function windowFor(total: number, months: number | null): { start: number; span: number } {
  const span =
    months === null ? total : Math.min(total, Math.max(Math.min(MIN_SPAN, total), months * POINTS_PER_MONTH));
  return { start: Math.max(0, total - span), span };
}

/** Index tại vị trí ngang tương đối frac∈[0,1] của cửa sổ [start, start+span) — kẹp frac.
 *  Dùng chung cho tap/pinch/wheel của PanZoomChart (px → frac → index). */
export function idxAtFrac(start: number, span: number, frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return start + Math.round(f * (span - 1));
}

/** date → giá SJC quy đổi USD/oz-tương-đương (= mức giá thế giới sẽ cần để bằng giá SJC thật,
 *  theo tỷ giá đúng ngày đó) — nghịch đảo công thức worldVndPerLuong ở scripts/run.ts, để vẽ
 *  cùng 1 trục $ với XAU/USD. Chỉ có ở ngày có cả sjcSell và usdVnd. */
export function sjcUsdMap(rows: VnGoldEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.sjcSell !== null && r.usdVnd !== null) {
      m.set(r.date, (r.sjcSell / r.usdVnd / LUONG_GRAMS) * TROY_OZ_GRAMS);
    }
  }
  return m;
}

interface SeriesPts {
  pts: { j: number; v: number }[];
  last: { j: number; v: number; d: string } | null;
}

function collect(win: TimelinePoint[], map: Map<string, number>): SeriesPts {
  const pts = win
    .map((q, j) => ({ j, v: map.get(q.date) }))
    .filter((o): o is { j: number; v: number } => o.v !== undefined);

  // giá trị thật gần nhất TRƯỚC cửa sổ — dùng làm điểm neo "giữ ngang" khi cửa sổ thiếu giá thật.
  let seedV: number | undefined;
  let seedD: string | undefined;
  if (win.length > 0) {
    for (const [d, v] of map) {
      if (d <= win[0].date) {
        seedV = v;
        seedD = d;
      }
    }
  }

  const lastReal = pts.length > 0 ? pts[pts.length - 1] : null;
  const last = lastReal
    ? { j: lastReal.j, v: lastReal.v, d: win[lastReal.j].date }
    : seedV !== undefined
      ? { j: 0, v: seedV, d: seedD! }
      : null;

  return { pts, last };
}

interface SeriesGeom {
  path: string | null;
  tailPath: string | null;
  from: string | null;
  asOf: string | null;
}

function render(
  win: TimelinePoint[],
  start: number,
  x: (i: number) => number,
  y: (v: number) => number,
  s: SeriesPts
): SeriesGeom {
  let path: string | null = null;
  let tailPath: string | null = null;
  let from: string | null = null;
  let asOf: string | null = null;

  if (s.pts.length >= 2) {
    path = s.pts.map((o, k) => `${k === 0 ? "M" : "L"}${x(start + o.j).toFixed(1)},${y(o.v).toFixed(1)}`).join("");
    if (s.pts[0].j > 0) from = win[s.pts[0].j].date;
  }

  const lastIdx = win.length - 1;
  if (s.last && s.last.j < lastIdx) {
    tailPath = `M${x(start + s.last.j).toFixed(1)},${y(s.last.v).toFixed(1)}L${x(start + lastIdx).toFixed(1)},${y(s.last.v).toFixed(1)}`;
    asOf = s.last.d;
  }

  return { path, tailPath, from, asOf };
}

export interface ChartGeom {
  W: number;
  H: number;
  x(i: number): number;
  /** trục USD/oz dùng chung cho cả 2 đường */
  y(v: number): number;
  /** luôn phủ toàn bộ cửa sổ — points[] không có ngày thiếu như vnRows */
  xauPath: string;
  xauMin: number;
  xauMax: number;
  /** null khi cửa sổ không giao dữ liệu SJC (cả sjcSell và usdVnd cùng ngày) */
  sjcPath: string | null;
  sjcTailPath: string | null;
  sjcFrom: string | null;
  sjcAsOf: string | null;
  /** min/max chung (xau ∪ sjc-quy-đổi) dùng cho nhãn trục */
  min: number;
  max: number;
}

export function buildGeom(
  points: TimelinePoint[],
  start: number,
  span: number,
  sjcUsd: Map<string, number>,
  W = 700,
  H = 160
): ChartGeom {
  const end = Math.min(points.length, start + span);
  const win = points.slice(start, end);
  const x = (i: number) => ((i - start) / Math.max(1, win.length - 1)) * W;
  const pad = 6;

  const xauVals = win.map((q) => q.price);
  const xauMin = Math.min(...xauVals);
  const xauMax = Math.max(...xauVals);

  const sc = collect(win, sjcUsd);
  const sjcVals = sc.pts.map((o) => o.v).concat(sc.last ? [sc.last.v] : []);

  const min = Math.min(xauMin, ...(sjcVals.length ? sjcVals : [xauMin]));
  const max = Math.max(xauMax, ...(sjcVals.length ? sjcVals : [xauMax]));
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - pad * 2) - pad;

  const xauPath = win.map((q, j) => `${j === 0 ? "M" : "L"}${x(start + j).toFixed(1)},${y(q.price).toFixed(1)}`).join("");
  const sjcR = render(win, start, x, y, sc);

  return {
    W,
    H,
    x,
    y,
    xauPath,
    xauMin,
    xauMax,
    sjcPath: sjcR.path,
    sjcTailPath: sjcR.tailPath,
    sjcFrom: sjcR.from,
    sjcAsOf: sjcR.asOf,
    min,
    max,
  };
}
