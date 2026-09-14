import { describe, it, expect } from "vitest";
import { calendarBlockBootstrapCi, countClusters } from "../scripts/study-lib";
import { blockBootstrapCi } from "../src/lib/indicators";

describe("countClusters", () => {
  it("gom tín hiệu trong cùng khối H phiên thành một cụm", () => {
    expect(countClusters([], 10)).toBe(0);
    expect(countClusters([0, 1, 2, 3], 10)).toBe(1); // cùng khối [0,10)
    expect(countClusters([0, 10, 20], 10)).toBe(3); // ba khối liền
    expect(countClusters([0, 9, 10], 10)).toBe(2); // 0,9 khối đầu; 10 sang khối sau
  });

  it("KHÔNG có hiệu ứng dây chuyền: tín hiệu rải đều vẫn tách cụm", () => {
    // Mỗi tín hiệu cách nhau H−1 phiên. Luật gộp-theo-gap sẽ nối tất cả thành MỘT cụm
    // (mỗi cặp liền nhau đều < H) dù chuỗi trải rất dài — đó là lý do bỏ luật đó.
    const idxs = Array.from({ length: 50 }, (_, k) => k * 9);
    expect(countClusters(idxs, 10)).toBeGreaterThan(40);
  });

  it("chuỗi dày liên tục trong một khối = 1 cụm; trải nhiều khối = nhiều cụm", () => {
    expect(countClusters(Array.from({ length: 10 }, (_, i) => i), 10)).toBe(1);
    expect(countClusters(Array.from({ length: 500 }, (_, i) => i), 10)).toBe(50);
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

  it("trả null khi chỉ có 2 cụm — n độc lập quá nhỏ để CI mang thông tin", () => {
    // 2 chùm, mỗi chùm gói gọn trong MỘT khối H=200: 30 quan sát nhưng chỉ 2 lần
    // quan sát độc lập. Bản cũ vẫn in ra một CI trông rất tự tin — đó là cái đang sửa.
    const series: (number | null)[] = new Array(1000).fill(null);
    for (let k = 0; k < 15; k++) series[k] = +1; // khối 0
    for (let k = 0; k < 15; k++) series[600 + k] = -1; // khối 3
    const filtered = series.filter((r): r is number => r !== null);

    expect(blockBootstrapCi(filtered, 10)).not.toBeNull(); // bản cũ: vẫn cho số
    expect(calendarBlockBootstrapCi(series, 200)).toBeNull(); // bản mới: nói thẳng không đo được
  });

  it("CI RỘNG hơn bản cũ khi tín hiệu bắn chùm trái dấu (đủ cụm để đo)", () => {
    // 6 chùm xen kẽ thắng/thua, mỗi chùm 10 ngày liền, cách nhau 200 phiên.
    const series: (number | null)[] = new Array(1400).fill(null);
    for (let c = 0; c < 6; c++) {
      for (let k = 0; k < 10; k++) series[c * 200 + k] = c % 2 ? +1 : -1;
    }
    const filtered = series.filter((r): r is number => r !== null);

    const old = blockBootstrapCi(filtered, 10)!;
    const now = calendarBlockBootstrapCi(series, 60)!;
    expect(now[1] - now[0]).toBeGreaterThan(old[1] - old[0]);
  });

  it("CI hẹp khi tín hiệu rải đều và đồng nhất kết quả", () => {
    const series: (number | null)[] = new Array(600).fill(null);
    for (let i = 0; i < 600; i += 6) series[i] = +1; // 100 tín hiệu rời nhau, đều thắng
    const ci = calendarBlockBootstrapCi(series, 6)!;
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
