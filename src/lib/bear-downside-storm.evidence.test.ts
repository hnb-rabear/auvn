import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { ewmaSigma, stormAt } from "./bear-downside-view";
import { furtherDrawdownPct } from "./bear-downside";
import type { Timeline } from "./types";

// Lý do tồn tại của cờ bão trên card: khi σ ≥ 1.3× trung vị 2 năm, đáy thực thủng p10
// của dải 3T NHIỀU HƠN ngày thường ở CẢ HAI giai đoạn. Khóa THỨ HẠNG, không khóa số
// (mỗi cron thêm ngày đáo hạn). Nếu đảo chiều ⇒ banner hết cơ sở, test phải đỏ.
const pts = (tlJson as unknown as Timeline).points;
const prices = pts.map((p) => p.price);
const sig = ewmaSigma(prices);

function dip10(era: "train" | "test", on: boolean): number {
  let n = 0, b = 0;
  for (let i = 0; i < pts.length; i += 3) {
    if ((pts[i].date < "2019-01-01") !== (era === "train")) continue;
    const band = pts[i].bearAsOf?.["63"];
    if (!band || stormAt(sig, i) !== on) continue;
    const d = furtherDrawdownPct(prices, i, 63);
    if (d === null) continue;
    n++; if (d < band.p10) b++;
  }
  return b / n;
}

describe("cờ bão: 3T thủng đáy nhiều hơn khi bật (timeline hiện tại)", () => {
  for (const era of ["train", "test"] as const) {
    it(era, () => expect(dip10(era, true)).toBeGreaterThan(dip10(era, false)));
  }
});
