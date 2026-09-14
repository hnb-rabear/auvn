import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextMonthStart } from "../scripts/fetch";

/**
 * Khóa bất biến past-only cho FEDFUNDS.
 *
 * FRED gắn nhãn chuỗi bằng ngày QUAN SÁT (đầu tháng) nhưng giá trị là trung bình
 * CẢ tháng đó, chỉ công bố sau khi tháng kết thúc. Mọi consumer lọc `f.date <= ngày
 * xét`, nên nhãn gốc cho look-ahead ~1 tháng trên toàn bộ lịch sử. fetchFedFunds
 * dời nhãn sang ngày khả dụng; cache trên đĩa phải cùng quy ước, nếu không
 * backtest/bottom lại đọc số chưa công bố.
 */
describe("FEDFUNDS availability shift", () => {
  it("nextMonthStart dời đúng 1 tháng, bắc cầu năm, đệm 0", () => {
    expect(nextMonthStart("2026-08-01")).toBe("2026-09-01");
    expect(nextMonthStart("2026-09-01")).toBe("2026-10-01");
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
    expect(nextMonthStart("1954-07-01")).toBe("1954-08-01");
  });

  it("cache fed-funds.json mang ngày KHẢ DỤNG, không phải ngày quan sát", () => {
    const rows: { date: string; value: number }[] = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "history", "fed-funds.json"), "utf8")
    );
    expect(rows.length).toBeGreaterThan(600);

    // Nhãn vẫn là mốc đầu tháng, tăng nghiêm ngặt (không trùng/không lùi).
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].date.endsWith("-01")).toBe(true);
      if (i) expect(rows[i].date > rows[i - 1].date).toBe(true);
    }

    // Chuỗi bắt đầu 1954-07 (quan sát) => sau khi dời phải là 1954-08.
    // Đây là cọc chống chạy migrate 2 lần (sẽ thành 1954-09).
    expect(rows[0].date).toBe("1954-08-01");

    // Dòng cuối không được vượt quá tháng sau tháng hiện tại: giá trị công bố
    // gần nhất là trung bình tháng trước, khả dụng từ đầu tháng này.
    const now = new Date();
    const limit = nextMonthStart(
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
    );
    expect(rows[rows.length - 1].date <= limit).toBe(true);
  });
});
