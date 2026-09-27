import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { bottomTierOf, computeTierEvidence } from "./bottom-tier";
import type { Timeline } from "./types";

const tl = tlJson as unknown as Timeline;
const ev = computeTierEvidence(tl.points);

// Lý do tồn tại của cả lớp hiển thị theo bậc: THỨ HẠNG phải đúng chiều ở CẢ HAI giai đoạn.
// Bằng chứng tính lại mỗi lần cron (bottom.json.tierEvidence) nên không khóa số cụ thể —
// nhưng nếu dữ liệu mới làm ĐẢO thứ hạng thì hiển thị bậc hết cơ sở: test phải đỏ.
describe("thứ hạng bậc đúng chiều ở cả hai giai đoạn (timeline hiện tại)", () => {
  for (const tier of ["cycle", "swing"] as const) {
    for (const era of ["train", "test"] as const) {
      it(`${tier} / ${era}: high > nền > low`, () => {
        const e = ev[tier];
        expect(e.high[era].favPct).toBeGreaterThan(e.high[era].basePct);
        expect(e.low[era].favPct).toBeLessThan(e.low[era].basePct);
      });
    }
  }
});

describe("computeTierEvidence", () => {
  it("nền của cùng giai đoạn giống nhau ở mọi bậc; n cộng lại = tổng ngày có nhãn", () => {
    for (const tier of ["cycle", "swing"] as const) {
      for (const era of ["train", "test"] as const) {
        const e = ev[tier];
        expect(e.normal[era].basePct).toBe(e.high[era].basePct);
        expect(e.low[era].basePct).toBe(e.high[era].basePct);
        expect(e.high[era].n + e.normal[era].n + e.low[era].n).toBeGreaterThan(0);
      }
    }
  });

  it("bậc high có đủ đợt độc lập để đọc (≥ 5 mỗi giai đoạn, cả hai tầng)", () => {
    for (const tier of ["cycle", "swing"] as const) {
      expect(ev[tier].high.train.clusters).toBeGreaterThanOrEqual(5);
      expect(ev[tier].high.test.clusters).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("bottomTierOf", () => {
  it("bin 3 ⇒ high, bin 2 ⇒ normal, bin 0–1 ⇒ low", () => {
    expect(bottomTierOf(3, false)).toBe("high");
    expect(bottomTierOf(2, false)).toBe("normal");
    expect(bottomTierOf(1, false)).toBe("low");
    expect(bottomTierOf(0, false)).toBe("low");
  });

  it("đang sụp nhanh hạ high xuống normal (bin 3 lúc sụp chỉ ngang nền)", () => {
    expect(bottomTierOf(3, true)).toBe("normal");
    expect(bottomTierOf(1, true)).toBe("low");
  });

  it("thiếu bin (JSON cũ) ⇒ normal, không bịa bậc cao", () => {
    expect(bottomTierOf(undefined, false)).toBe("normal");
    expect(bottomTierOf(null, false)).toBe("normal");
  });
});
