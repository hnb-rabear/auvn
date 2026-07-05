import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { HIGH_CONF_3M_EVIDENCE, HIGH_CONFIDENCE_BIN } from "./fusion";
import { blockBootstrapCi } from "./indicators";
import { PRESETS, presetComposite, type Timeline, type TimelinePoint } from "./types";

const tl = tlJson as unknown as Timeline;
const preset = PRESETS.find((p) => p.id === "3m")!;

// v4: cùng hàm presetComposite với UI/monitor/fusion-study — chart ≡ card ≡ evidence.
const buy = (p: TimelinePoint) => presetComposite(p.scores, preset) >= preset.buyThreshold;
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
  // Toàn giai đoạn + CI block-bootstrap (block=H/3). Tập B chọn theo NGÀY (không
  // decimate theo chỉ-số), nên ổn định khi cron tái sinh timeline đổi độ dài đầu chuỗi
  // — khác lưới-thưa i%STEP cũ (số trôi 54/58/46 theo canh-pha). Block-bootstrap đã
  // xử lý autocorrelation của tín hiệu bắn chùm, thay cho việc decimate để decorrelate.
  it("toàn giai đoạn + CI block-bootstrap", () => {
    const all = B(pts);
    expect(all.length).toBe(HIGH_CONF_3M_EVIDENCE.fullN);
    expect(favPct(all)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.fullFav, 0);
    const fav = all.map((p) => ((p.returns["63"] as number) > 0 ? 1 : -1));
    expect(blockBootstrapCi(fav, Math.round(63 / 3))).toEqual(HIGH_CONF_3M_EVIDENCE.fullCi);
  });
  it("placebo đồng-n train (thông tin trực giao)", () => {
    const train = pts.filter((p) => p.date < "2019-01-01");
    const bTrain = B(train);
    const topN = train
      .filter(buy)
      .sort((a, b) => presetComposite(b.scores, preset) - presetComposite(a.scores, preset))
      .slice(0, bTrain.length);
    expect(favPct(bTrain) - favPct(topN)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt, 0);
  });
});
