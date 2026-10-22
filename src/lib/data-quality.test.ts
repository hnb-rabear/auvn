import { describe, it, expect } from "vitest";
import {
  MAX_AGE_DAYS,
  lastDateWhere,
  assessDataQuality,
  dataQualityTransitions,
  countRevisions,
  type DataQuality,
} from "./data-quality";

describe("assessDataQuality", () => {
  const today = "2026-10-22";
  const dq = assessDataQuality(
    {
      xau: { date: "2026-10-22", source: "yahoo:GC=F" },
      fed: { date: "2026-09-01", source: "cache" },
      ring: { date: "2026-09-27", source: "history" },
      sjc: { date: "2026-10-18", source: "cafef" },
      usdVnd: { date: null, source: "none" },
    },
    today
  );
  it("tình huống thật 2026-10-22: nhẫn 25 ngày, Fed 51 ngày ⇒ stale", () => {
    expect(dq.ring).toEqual({ asOfDate: "2026-09-27", source: "history", ageDays: 25, maxAgeDays: 2, status: "stale" });
    expect(dq.fed.status).toBe("stale");
    expect(dq.fed.ageDays).toBe(51);
    expect(dq.xau.status).toBe("ok");
  });
  it("đúng vạch maxAgeDays vẫn ok (stale khi VƯỢT)", () => {
    expect(dq.sjc).toMatchObject({ ageDays: 4, maxAgeDays: MAX_AGE_DAYS.sjc, status: "ok" });
  });
  it("không có ngày, hoặc không có mục ⇒ missing, ageDays null", () => {
    expect(dq.usdVnd).toMatchObject({ asOfDate: null, ageDays: null, status: "missing" });
    expect(dq.dxy).toMatchObject({ source: "none", status: "missing" });
  });
  it("đủ 7 key", () => {
    expect(Object.keys(dq).sort()).toEqual(["dxy", "fed", "ring", "sjc", "usdVnd", "xau", "yield10y"]);
  });
});

describe("lastDateWhere", () => {
  it("ngày cuối cùng thỏa điều kiện, null khi không có", () => {
    const rows = [
      { date: "2026-09-27", v: 1 },
      { date: "2026-09-28", v: null },
    ];
    expect(lastDateWhere(rows, (r) => r.v !== null)).toBe("2026-09-27");
    expect(lastDateWhere(rows, () => false)).toBeNull();
  });
});

describe("dataQualityTransitions", () => {
  const mk = (ring: "ok" | "stale"): DataQuality =>
    assessDataQuality(
      {
        xau: { date: "2026-10-22", source: "y" },
        dxy: { date: "2026-10-22", source: "y" },
        yield10y: { date: "2026-10-22", source: "y" },
        fed: { date: "2026-10-01", source: "fred" },
        sjc: { date: "2026-10-22", source: "cafef" },
        ring: { date: ring === "ok" ? "2026-10-22" : "2026-10-15", source: "btmc" },
        usdVnd: { date: "2026-10-22", source: "vcb" },
      },
      "2026-10-22"
    );
  it("ok→stale→stale→ok ra đúng 2 tin (hỏng 1 lần, phục hồi 1 lần)", () => {
    let state: Record<string, string> = {};
    const sent: string[] = [];
    for (const s of ["ok", "stale", "stale", "ok"] as const) {
      const t = dataQualityTransitions(state, mk(s));
      sent.push(...t.lines);
      state = t.state;
    }
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("nhẫn");
    expect(sent[0]).toContain("7 ngày");
    expect(sent[1]).toContain("có lại");
  });
  it("lần chạy đầu (state rỗng) báo ngay trường đang hỏng, không báo trường ok", () => {
    const t = dataQualityTransitions({}, mk("stale"));
    expect(t.lines).toHaveLength(1);
    expect(t.state["data:ring"]).toBe("stale");
    expect(t.state["data:xau"]).toBe("ok");
  });
});

describe("countRevisions", () => {
  const prev = [
    { date: "2026-10-16", price: 4200 },
    { date: "2026-10-19", price: 4160.1 },
    { date: "2026-10-20", price: 4142.6 },
    { date: "2026-10-21", price: 4150 },
    { date: "2026-10-22", price: 4120 },
  ];
  it("đếm phiên quá khứ lệch > 0,5%, bỏ 2 phiên cuối của bản cũ", () => {
    const bars = [
      { date: "2026-10-16", close: 4230 }, // +0,71% ⇒ sửa
      { date: "2026-10-19", close: 4161 }, // +0,02% ⇒ làm tròn
      { date: "2026-10-20", close: 4142.6 },
      { date: "2026-10-21", close: 4300 }, // phiên chưa chốt — bỏ
      { date: "2026-10-22", close: 4108.3 }, // phiên đang chạy — bỏ
    ];
    expect(countRevisions(prev, bars)).toBe(1);
  });
  it("không có bản cũ ⇒ 0", () => {
    expect(countRevisions([], [{ date: "2026-10-16", close: 1 }])).toBe(0);
  });
});
