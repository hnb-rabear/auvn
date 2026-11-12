import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { ewmaSigma, stormEvidence } from "./bear-downside-view";
import type { Timeline } from "./types";

// Lý do tồn tại của cờ bão trên card: khi σ ≥ 1.3× trung vị 2 năm, đáy thực thủng p10
// của dải 3T NHIỀU HƠN ngày thường ở CẢ HAI giai đoạn. Khóa THỨ HẠNG, không khóa số
// (mỗi cron thêm ngày đáo hạn). Nếu đảo chiều ⇒ banner hết cơ sở, test phải đỏ.
// Gọi đúng `stormEvidence` đã ship; chia era bằng cách che bearAsOf ngoài era (giữ chỉ số để khớp σ).
const pts = (tlJson as unknown as Timeline).points;
const sig = ewmaSigma(pts.map((p) => p.price));

function evidence63(era: "train" | "test") {
  const masked = pts.map((p, i) => ((p.date < "2019-01-01") === (era === "train") ? p : { ...p, bearAsOf: undefined }));
  return stormEvidence(masked, sig)["63"];
}

describe("cờ bão: 3T thủng đáy nhiều hơn khi bật (timeline hiện tại)", () => {
  for (const era of ["train", "test"] as const) {
    it(era, () => {
      const e = evidence63(era);
      expect(e).not.toBeNull();
      expect(e!.onDip10).toBeGreaterThan(e!.offDip10);
    });
  }
});
