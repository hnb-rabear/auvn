import { describe, it, expect } from "vitest";
import { gomRaiIdxs, gomRaiIdxsBy, idxRuns } from "../src/lib/timeline";
import { deriveGuidance } from "../src/lib/guidance";
import { consensusZone } from "../src/lib/consensus";
import { zoneOf, type TimelinePoint, type BearPhase, type Zone } from "../src/lib/types";

/** Điểm timeline tối giản — gomRaiIdxs chỉ đọc cycleProb/cycleProbUw/cycleN. */
function pt(bottom: {
  cycleProb?: number | null;
  cycleProbUw?: number | null;
  cycleN?: number;
}): TimelinePoint {
  return {
    date: "2020-01-01",
    price: 1500,
    composite: 0,
    zone: "neutral",
    scores: {},
    returns: { "21": null, "63": null, "126": null },
    ...bottom,
  };
}

/**
 * Bộ ca phủ đủ nhánh: buy / headwind / trung tính, cổng acute (probUw thấp, cao,
 * thiếu), biên prob=60, biên composite = ngưỡng mua và −40, n<10, prob null/undefined.
 */
const CASES: { comp: number; phase: BearPhase; p: TimelinePoint; expectDca: boolean }[] = [
  { comp: 50, phase: "grind", p: pt({ cycleProb: 70, cycleN: 600 }), expectDca: false }, // vùng mua
  { comp: -45, phase: "grind", p: pt({ cycleProb: 70, cycleN: 600 }), expectDca: false }, // gió ngược
  { comp: 0, phase: "grind", p: pt({ cycleProb: 65, cycleN: 600 }), expectDca: true },
  { comp: 0, phase: "acute", p: pt({ cycleProb: 65, cycleProbUw: 41, cycleN: 600 }), expectDca: false }, // cổng acute hạ prob
  { comp: 0, phase: "acute", p: pt({ cycleProb: 65, cycleProbUw: 70, cycleN: 600 }), expectDca: true }, // acute nhưng bản thận trọng vẫn cao
  { comp: 0, phase: "acute", p: pt({ cycleProb: 65, cycleN: 600 }), expectDca: true }, // acute thiếu probUw → fallback prob
  { comp: 0, phase: "grind", p: pt({ cycleProb: 59.9, cycleN: 600 }), expectDca: false },
  { comp: 0, phase: "grind", p: pt({ cycleProb: 60, cycleN: 600 }), expectDca: true }, // biên ≥60
  { comp: 0, phase: "grind", p: pt({ cycleProb: 65, cycleN: 9 }), expectDca: false }, // chưa đủ mẫu
  { comp: 0, phase: "grind", p: pt({ cycleProb: null, cycleN: 0 }), expectDca: false },
  { comp: 0, phase: "grind", p: pt({}), expectDca: false }, // timeline.json cũ (undefined)
  { comp: 40, phase: "grind", p: pt({ cycleProb: 70, cycleN: 600 }), expectDca: false }, // biên = ngưỡng mua
  { comp: -40, phase: "grind", p: pt({ cycleProb: 70, cycleN: 600 }), expectDca: false }, // biên = −40 (gió ngược)
  { comp: 39.9, phase: "bull", p: pt({ cycleProb: 61, cycleN: 600 }), expectDca: true }, // sát ngưỡng mua vẫn trung tính
];

const BUY_THR = 40;
const points = CASES.map((c) => c.p);
const comps = CASES.map((c) => c.comp);
const phases = CASES.map((c) => c.phase);

describe("gomRaiIdxs", () => {
  it("đánh dấu đúng từng ca (cổng acute, biên ngưỡng, thiếu dữ liệu)", () => {
    const got = new Set(gomRaiIdxs(points, comps, BUY_THR, phases));
    for (let i = 0; i < CASES.length; i++) {
      expect(got.has(i), `ca ${i}`).toBe(CASES[i].expectDca);
    }
  });

  it("GOLDEN: trùng từng ngày với deriveGuidance level 'dca' (cùng cách dựng input với histGuidance của Máy thời gian)", () => {
    const got = new Set(gomRaiIdxs(points, comps, BUY_THR, phases));
    for (let i = 0; i < CASES.length; i++) {
      const p = points[i];
      const crash = phases[i] === "acute";
      const rec = p.cycleProb ?? null;
      const prob = crash ? (p.cycleProbUw ?? rec) : rec;
      const n = p.cycleN ?? 0;
      const verified = prob !== null && n >= 10;
      const high = verified && (prob as number) >= 60;
      const g = deriveGuidance({
        zone: zoneOf(comps[i], BUY_THR),
        composite: comps[i],
        bottom: { high, verified, label: "Săn đáy: (test)." },
        premiumPct: null,
        premiumP80: null,
      });
      expect(got.has(i), `ca ${i}: dải=${got.has(i)} nhưng guidance=${g.level}`).toBe(
        g.level === "dca"
      );
    }
  });

  it("tôn trọng ngưỡng mua của preset (50): composite 45 là trung tính → dca", () => {
    const got = gomRaiIdxs(
      [pt({ cycleProb: 65, cycleN: 600 })],
      [45],
      50,
      ["grind"]
    );
    expect(got).toEqual([0]);
  });

  it("gomRaiIdxs ≡ gomRaiIdxsBy với isBuy/isHeadwind dựng từ comps (wrapper không đổi hành vi)", () => {
    expect(gomRaiIdxs(points, comps, BUY_THR, phases)).toEqual(
      gomRaiIdxsBy(
        points,
        comps.map((c) => c >= BUY_THR),
        comps.map((c) => c <= -40),
        phases
      )
    );
  });
});

describe("gomRaiIdxsBy — chế độ đồng thuận preset", () => {
  // Cùng dữ liệu đáy, trục mua theo k/3 preset: radar ≥ +40 KHÔNG còn chặn dải khi
  // k=0; k≥1 chặn dù radar trung tính; gió ngược vẫn theo radar ≤ −40.
  const CONS: { k: number; radar: number; p: TimelinePoint; phase: BearPhase; expectDca: boolean }[] = [
    { k: 0, radar: 45, p: pt({ cycleProb: 65, cycleN: 600 }), phase: "grind", expectDca: true }, // radar buy cũ nhưng k=0 ⇒ trung tính ⇒ dca
    { k: 1, radar: 0, p: pt({ cycleProb: 65, cycleN: 600 }), phase: "grind", expectDca: false }, // preset báo mua ⇒ không dca
    { k: 0, radar: -45, p: pt({ cycleProb: 65, cycleN: 600 }), phase: "grind", expectDca: false }, // gió ngược radar
    { k: 0, radar: 0, p: pt({ cycleProb: 65, cycleN: 600 }), phase: "grind", expectDca: true },
    { k: 0, radar: 0, p: pt({ cycleProb: 59, cycleN: 600 }), phase: "grind", expectDca: false },
  ];
  const cPoints = CONS.map((c) => c.p);
  const cIsBuy = CONS.map((c) => c.k >= 1);
  const cHead = CONS.map((c) => c.radar <= -40);
  const cPhases = CONS.map((c) => c.phase);

  it("đánh dấu đúng từng ca", () => {
    const got = new Set(gomRaiIdxsBy(cPoints, cIsBuy, cHead, cPhases));
    for (let i = 0; i < CONS.length; i++) {
      expect(got.has(i), `ca ${i}`).toBe(CONS[i].expectDca);
    }
  });

  it("GOLDEN: trùng từng ngày với deriveGuidance level 'dca' khi zone dựng theo đồng thuận (cùng cách với Dashboard/TimeMachine)", () => {
    const got = new Set(gomRaiIdxsBy(cPoints, cIsBuy, cHead, cPhases));
    for (let i = 0; i < CONS.length; i++) {
      const c = CONS[i];
      const compZone = zoneOf(c.radar, 40);
      const zone: Zone =
        c.k >= 1
          ? consensusZone(c.k)
          : compZone === "sell" || compZone === "strong-sell"
            ? compZone
            : "neutral";
      const g = deriveGuidance({
        zone,
        composite: c.radar,
        bottom: { high: (c.p.cycleProb ?? 0) >= 60, verified: c.p.cycleProb != null, label: "Săn đáy: (test)." },
        premiumPct: null,
        premiumP80: null,
        scoreReason: "Điểm mua: (test đồng thuận).",
      });
      expect(got.has(i), `ca ${i}: dải=${got.has(i)} nhưng guidance=${g.level}`).toBe(
        g.level === "dca"
      );
    }
  });
});

describe("idxRuns", () => {
  it("rỗng → rỗng", () => expect(idxRuns([])).toEqual([]));
  it("1 ngày đứng riêng → cụm [i,i]", () => expect(idxRuns([7])).toEqual([[7, 7]]));
  it("liên tục gộp, đứt quãng tách cụm", () =>
    expect(idxRuns([1, 2, 3, 7, 9, 10])).toEqual([
      [1, 3],
      [7, 7],
      [9, 10],
    ]));
});
