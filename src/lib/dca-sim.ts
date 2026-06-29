// src/lib/dca-sim.ts
/** Mô phỏng DCA ngân sách cố định/tháng + tính giá vốn. Thuần, dùng chung study + engine. */
import { seededRandom } from "./indicators";
import { inZone } from "./dca-zone";
import type { ZoneRule } from "@/lib/types";

export interface DcaBar { date: string; close: number; }

/** Trả GLOBAL index ngày mua trong tháng (monthIdxs là các global index của tháng đó). */
export type BuyPicker = (monthIdxs: number[], closes: number[]) => number;

export interface DcaResult {
  /** giá vốn = nMonths / Σ(1/price_mua) (ngân sách cố định triệt tiêu) */
  costBasis: number;
  nMonths: number;
  sumInvPrice: number;
}

/** Gom global index theo YYYY-MM (7 ký tự đầu của date), giữ thứ tự thời gian. */
export function groupByMonth(dates: string[]): number[][] {
  const out: number[][] = [];
  let curKey = "";
  for (let i = 0; i < dates.length; i++) {
    const key = dates[i].slice(0, 7);
    if (key !== curKey) { out.push([]); curKey = key; }
    out[out.length - 1].push(i);
  }
  return out;
}

export function simulateDca(closes: number[], months: number[][], pick: BuyPicker): DcaResult {
  let sumInv = 0;
  for (const m of months) {
    if (m.length === 0) continue;
    const idx = pick(m, closes);
    sumInv += 1 / closes[idx];
  }
  const n = months.length;
  return { costBasis: n / sumInv, nMonths: n, sumInvPrice: sumInv };
}

export function improvementPct(rule: DcaResult, base: DcaResult): number {
  return ((base.costBasis - rule.costBasis) / base.costBasis) * 100;
}

export const pickFirst: BuyPicker = (m) => m[0];
export const pickMid: BuyPicker = (m) => m[Math.floor(m.length / 2)];

/** Placebo: mua ngày ngẫu nhiên mỗi tháng, seed cố định để tái lập. */
export function pickSeededRandom(seed: number): BuyPicker {
  const rand = seededRandom(seed);
  return (m) => m[Math.floor(rand() * m.length)];
}

/** Picker theo luật: phiên ĐẦU trong tháng có inZone=true; không có -> phiên cuối (buộc mua). */
export function buildRulePicker(rule: ZoneRule, monthStart: Map<number, number>): BuyPicker {
  return (m, closes) => {
    const start = monthStart.get(m[0]) ?? m[0];
    for (const idx of m) if (inZone(closes, idx, rule, start)) return idx;
    return m[m.length - 1];
  };
}

/** Mảng ±1: 1 nếu giá mua theo luật ≤ giá baseline trong cùng tháng. + tỉ lệ % (0..100). */
export function monthsBetterFraction(
  closes: number[], months: number[][], rulePick: BuyPicker, basePick: BuyPicker
): { favArr: number[]; pct: number } {
  const favArr: number[] = [];
  for (const m of months) {
    if (m.length === 0) continue;
    favArr.push(closes[rulePick(m, closes)] <= closes[basePick(m, closes)] ? 1 : -1);
  }
  const pos = favArr.filter((x) => x > 0).length;
  return { favArr, pct: favArr.length ? (pos / favArr.length) * 100 : 0 };
}
