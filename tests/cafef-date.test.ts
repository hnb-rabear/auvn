import { describe, it, expect } from "vitest";
import { pickCafefSjc } from "../scripts/fetch";

const payload = (rows: { name: string; sellPrice: number; createdAt: string }[]) => ({
  Data: { goldPriceWorldHistories: rows.map((r) => ({ buyPrice: r.sellPrice - 3, ...r })) },
});

describe("pickCafefSjc", () => {
  it("lấy dòng SJC của đúng ngày VN, muộn nhất trong ngày", () => {
    const p = payload([
      { name: "SJC", sellPrice: 142.3, createdAt: "2026-10-22T03:44:28Z" }, // VN 10:44 ngày 22
      { name: "SJC", sellPrice: 142.0, createdAt: "2026-10-21T18:00:00Z" }, // VN 01:00 ngày 22
      { name: "SJC", sellPrice: 141.0, createdAt: "2026-10-21T16:59:57Z" }, // VN 23:59 ngày 21
    ]);
    expect(pickCafefSjc(p, "2026-10-22")?.sellPrice).toBe(142.3);
  });
  it("dòng mới nhất là hôm qua ⇒ null, không ghi giá hôm qua thành hôm nay", () => {
    const p = payload([{ name: "SJC", sellPrice: 141.0, createdAt: "2026-10-21T16:59:57Z" }]);
    expect(pickCafefSjc(p, "2026-10-22")).toBeNull();
  });
  it("bỏ dòng không phải SJC hoặc thiếu createdAt", () => {
    const p = { Data: { goldPriceWorldHistories: [{ name: "DOJI", sellPrice: 1, createdAt: "2026-10-22T03:00:00Z" }, { name: "SJC", sellPrice: 2 }] } };
    expect(pickCafefSjc(p, "2026-10-22")).toBeNull();
  });
});
