import { describe, it, expect } from "vitest";
import { calendarBlockBootstrapCi, countClusters } from "../scripts/study-lib";
import { blockBootstrapCi } from "../src/lib/indicators";

describe("countClusters", () => {
  it("gộp tín hiệu cách nhau < H thành một cụm", () => {
    expect(countClusters([0, 1, 2, 3], 10)).toBe(1);
    expect(countClusters([0, 10, 20], 10)).toBe(3);
    expect(countClusters([], 10)).toBe(0);
    // So với tín hiệu LIỀN TRƯỚC, không so mốc đầu cụm: 9 cách 0 là 9 (<10) nên cùng
    // cụm; 10 cách 9 chỉ 1 nên vẫn cụm đó. Chuỗi dày liên tục = 1 cụm dù kéo dài bao
    // lâu — cố ý bảo thủ, vì mỗi ngày kề đều chồng gần trọn cửa sổ tương lai.
    expect(countClusters([0, 9, 10], 10)).toBe(1);
    expect(countClusters(Array.from({ length: 500 }, (_, i) => i), 10)).toBe(1);
    // Nhưng cách nhau đúng H thì tách: cửa sổ không còn chồng.
    expect(countClusters([0, 9, 19], 10)).toBe(2);
  });
});

describe("calendarBlockBootstrapCi", () => {
  /** Chuỗi: 2 chùm tách xa nhau, một chùm toàn thắng, một chùm toàn thua. */
  function twoClusters(): (number | null)[] {
    const out: (number | null)[] = new Array(600).fill(null);
    for (let i = 0; i < 30; i++) out[i] = +1; // chùm thắng
    for (let i = 400; i < 430; i++) out[i] = -1; // chùm thua
    return out;
  }

  it("CI RỘNG khi chỉ có 2 cụm độc lập trái dấu (bản cũ báo hẹp giả)", () => {
    const series = twoClusters();
    const filtered = series.filter((r): r is number => r !== null); // 30 thắng + 30 thua

    // Bản cũ: mảng đã lọc, khoảng cách lịch biến mất ⇒ trộn hai chùm như thể
    // 60 quan sát độc lập ⇒ CI quanh 50% và hẹp.
    const old = blockBootstrapCi(filtered, 10)!;
    // Bản mới: bốc theo khối lịch ⇒ hoặc trúng chùm thắng hoặc chùm thua.
    const now = calendarBlockBootstrapCi(series, 60)!;

    const widthOld = old[1] - old[0];
    const widthNew = now[1] - now[0];
    expect(widthNew).toBeGreaterThan(widthOld);
    // Phải với tới được cả hai cực, không kẹt quanh 50%.
    expect(now[0]).toBeLessThan(20);
    expect(now[1]).toBeGreaterThan(80);
  });

  it("CI hẹp khi tín hiệu rải đều và đồng nhất kết quả", () => {
    const series: (number | null)[] = new Array(600).fill(null);
    for (let i = 0; i < 600; i += 6) series[i] = +1; // 100 tín hiệu, đều thắng
    const ci = calendarBlockBootstrapCi(series, 60)!;
    expect(ci[0]).toBeGreaterThan(95);
    expect(ci[1]).toBe(100);
  });

  it("trả null khi quá ít tín hiệu", () => {
    const series: (number | null)[] = new Array(100).fill(null);
    series[0] = 1;
    series[50] = -1;
    expect(calendarBlockBootstrapCi(series, 20)).toBeNull();
  });

  it("tái lập: cùng seed cho cùng kết quả", () => {
    const s = twoClusters();
    expect(calendarBlockBootstrapCi(s, 60)).toEqual(calendarBlockBootstrapCi(s, 60));
  });
});
