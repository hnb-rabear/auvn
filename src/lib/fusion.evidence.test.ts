import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { HIGH_CONF_3M_EVIDENCE, HIGH_CONFIDENCE_BIN } from "./fusion";
import { PRESETS, type Timeline, type TimelinePoint } from "./types";

const tl = tlJson as unknown as Timeline;
const preset = PRESETS.find((p) => p.id === "3m")!;

function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0, tw = 0;
  for (const [k, v] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (v as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}
const STEP = 3;
const buy = (p: TimelinePoint) => composite(p, preset.weights) >= preset.buyThreshold;
const pts = tl.points.filter((p) => p.returns["63"] !== null && p.cycleBin !== undefined);
const B = (seg: TimelinePoint[]) =>
  seg.filter((p) => buy(p) && p.cycleBin === HIGH_CONFIDENCE_BIN);
const favPct = (seg: TimelinePoint[]) => {
  const r = seg.map((p) => p.returns["63"] as number);
  return (r.filter((x) => x > 0).length / r.length) * 100;
};

// Khóa TẤT CẢ số hiển thị trong HIGH_CONF_3M_EVIDENCE để chúng không trôi âm thầm
// khỏi dữ liệu (CLAUDE.md: không bao giờ bịa số kiểm chứng).
describe("HIGH_CONF_3M_EVIDENCE khớp timeline.json", () => {
  it("train (2009–2018)", () => {
    const tr = B(pts.filter((p) => p.date < "2019-01-01"));
    expect(tr.length).toBe(HIGH_CONF_3M_EVIDENCE.trainN);
    expect(favPct(tr)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.trainFav, 0);
  });
  it("test (2019–2026)", () => {
    const te = B(pts.filter((p) => p.date >= "2019-01-01"));
    expect(te.length).toBe(HIGH_CONF_3M_EVIDENCE.testN);
    expect(favPct(te)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.testFav, 0);
  });
  it("lưới thưa STEP=3 (toàn giai đoạn)", () => {
    const sparseB = tl.points.filter(
      (p, i) =>
        i % STEP === 0 &&
        p.returns["63"] !== null &&
        p.cycleBin !== undefined &&
        buy(p) &&
        p.cycleBin === HIGH_CONFIDENCE_BIN
    );
    expect(sparseB.length).toBe(HIGH_CONF_3M_EVIDENCE.sparseN);
    expect(favPct(sparseB)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.sparseFav, 0);
  });
  it("placebo đồng-n train (thông tin trực giao)", () => {
    const train = pts.filter((p) => p.date < "2019-01-01");
    const bTrain = B(train);
    const topN = train
      .filter(buy)
      .sort((a, b) => composite(b, preset.weights) - composite(a, preset.weights))
      .slice(0, bTrain.length);
    expect(favPct(bTrain) - favPct(topN)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt, 0);
  });
});
