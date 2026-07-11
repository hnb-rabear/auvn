import { describe, expect, it } from "vitest";
import { createAsOfEngine, verdictFor } from "./as-of";
import { DEFAULT_WEIGHTS, PRESETS, type TimelinePoint } from "./types";
import { presetComposites, composites } from "./timeline";
import timelineJson from "../../public/data/timeline.json";

const realPoints = (timelineJson as { points: TimelinePoint[] }).points;

/** Điểm synthetic: mọi tiêu chí cùng score s ⇒ composite = s*50 (presetComposite fold macro). */
function mk(date: string, s: number, extra: Partial<TimelinePoint> = {}): TimelinePoint {
  return {
    date,
    price: 2000,
    composite: s * 50,
    zone: "neutral",
    scores: { technical: s, premium: s, macro: s, stats: s, momentum: s },
    returns: { "21": 1.5, "63": -2, "126": null },
    ...extra,
  } as TimelinePoint;
}

const MODE = { preset: null, weights: DEFAULT_WEIGHTS, consensusMode: true, fusionDegraded: false };

describe("createAsOfEngine — đồng thuận", () => {
  it("mọi tiêu chí +2 ⇒ 3/3 preset báo mua, zone strong-buy, guidance buy-side", () => {
    const pts = [mk("2020-01-01", 0), mk("2020-01-02", 2)];
    const d = createAsOfEngine(pts, MODE).day(1);
    expect(d.kDay).toBe(3);
    expect(d.zone).toBe("strong-buy");
    expect(d.verdictLabel).toBe("3/3 PRESET BÁO MUA");
    expect(["buy", "strong"]).toContain(d.guidance.level);
    // as-of luôn tắt premium (world-only)
    expect(d.guidance.reasons[2]).toBe("Chênh VN: chưa có dữ liệu.");
  });

  it("mọi tiêu chí 0 ⇒ k=0, wait", () => {
    const d = createAsOfEngine([mk("2020-01-01", 0)], MODE).day(0);
    expect(d.kDay).toBe(0);
    expect(d.zone).toBe("neutral");
    expect(d.verdictLabel).toBe("CHƯA CÓ TÍN HIỆU MUA");
    expect(d.guidance.level).toBe("wait");
  });

  it("mọi tiêu chí −2 ⇒ radar âm sâu, headwind (OBSERVE — không phải lệnh bán)", () => {
    const d = createAsOfEngine([mk("2020-01-01", -2)], MODE).day(0);
    expect(d.isSell).toBe(true);
    expect(d.zone).toBe("neutral"); // mặc định ẩn vùng bán
    expect(d.guidance.level).toBe("headwind");
    expect(d.guidance.tone).toBe("neutral");
  });

  it("signalIdxs = ngày có k≥1", () => {
    const eng = createAsOfEngine([mk("2020-01-01", 0), mk("2020-01-02", 2)], MODE);
    expect(eng.signalIdxs).toEqual([1]);
  });
});

describe("createAsOfEngine — chế độ preset", () => {
  it("comps = presetComposites, signalIdxs theo ngưỡng preset", () => {
    const p3m = PRESETS.find((p) => p.id === "3m")!;
    const pts = [mk("2020-01-01", 0), mk("2020-01-02", 2)];
    const eng = createAsOfEngine(pts, { ...MODE, consensusMode: false, preset: p3m });
    expect(eng.comps).toEqual(presetComposites(pts, p3m));
    expect(eng.buyKs).toBeNull();
    expect(eng.signalIdxs).toEqual([1]);
  });
});

describe("createAsOfEngine — dữ liệu thật (invariant, data append-only)", () => {
  const eng = createAsOfEngine(realPoints, MODE);

  it("comps khớp composites(DEFAULT_WEIGHTS) — radar ngữ cảnh", () => {
    expect(eng.comps).toEqual(composites(realPoints, DEFAULT_WEIGHTS));
  });

  it("cổng acute-crash: crashDay ⇒ prob hiển thị = bản không trọng số; có ≥1 ngày acute trong lịch sử", () => {
    let acuteSeen = 0;
    for (let i = 0; i < realPoints.length; i += 7) {
      const d = eng.day(i);
      const p = realPoints[i];
      if (d.crashDay) {
        acuteSeen++;
        expect(d.cycleProb).toBe(p.cycleProbUw ?? p.cycleProb ?? null);
        expect(d.cycleCi).toBeNull(); // CI không hiển thị khi crash (khác scheme trọng số)
      } else {
        expect(d.cycleProb).toBe(p.cycleProb ?? null);
      }
    }
    expect(acuteSeen).toBeGreaterThan(0); // 2020-03 v.v. phải tồn tại
  });

  it("dca as-of ≡ bearDcaAt trên cùng series (golden wiring)", async () => {
    const { bearDcaAt } = await import("./bear-dca");
    const prices = realPoints.map((q) => q.price);
    const i = realPoints.length - 1;
    const want = bearDcaAt(prices, i, realPoints[i].pricePct2y ?? null);
    const got = eng.day(i).dca;
    expect(got.phase).toBe(want.phase);
    expect(got.mult).toBe(want.mult);
  });
});

describe("verdictFor", () => {
  it("mua đúng khi giá tăng; bán chỉ chấm 1 tháng", () => {
    expect(verdictFor("buy", 3, "63")).toBe("right");
    expect(verdictFor("buy", -3, "63")).toBe("wrong");
    expect(verdictFor("sell", -3, "21")).toBe("right");
    expect(verdictFor("sell", -3, "63")).toBe("n/a");
    expect(verdictFor("neutral", 3, "21")).toBeNull();
    expect(verdictFor("buy", null, "21")).toBeNull();
  });
});
