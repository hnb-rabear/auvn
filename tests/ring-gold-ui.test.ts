import { describe, it, expect } from "vitest";
import { parseSettings, DEFAULT_SETTINGS, type Settings } from "../src/lib/settings";
import { DEFAULT_WEIGHTS } from "../src/lib/types";

describe("ring gold settings parser & state preservation", () => {
  it("defaults to btmc on null, empty, or invalid JSON input", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("invalid json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{}")).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates legacy settings without ringBrand cleanly", () => {
    const legacy = JSON.stringify({
      weights: DEFAULT_WEIGHTS,
      presetId: "3m",
    });
    const parsed = parseSettings(legacy);
    expect(parsed.ringBrand).toBe("btmc");
    expect(parsed.presetId).toBe("3m");
    expect(parsed.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("normalizes invalid ringBrand values to btmc without dropping weights or preset", () => {
    const invalidValues = ["sjc", "PNJ", "mihong", "doji", "", null, 123, {}, []];
    for (const v of invalidValues) {
      const raw = JSON.stringify({
        weights: DEFAULT_WEIGHTS,
        presetId: "6m",
        ringBrand: v,
      });
      const parsed = parseSettings(raw);
      expect(parsed.ringBrand).toBe("btmc");
      expect(parsed.presetId).toBe("6m");
      expect(parsed.weights).toEqual(DEFAULT_WEIGHTS);
    }
  });

  it("preserves valid btmh ringBrand", () => {
    const raw = JSON.stringify({
      weights: DEFAULT_WEIGHTS,
      presetId: "1m",
      ringBrand: "btmh",
    });
    const parsed = parseSettings(raw);
    expect(parsed.ringBrand).toBe("btmh");
    expect(parsed.presetId).toBe("1m");
    expect(parsed.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("rejects non-finite, negative, or invalid weight numbers at trust boundary", () => {
    const invalidWeightPayloads = [
      JSON.stringify({ weights: { ...DEFAULT_WEIGHTS, technical: 1e999 } }), // Infinity
      JSON.stringify({ weights: { ...DEFAULT_WEIGHTS, technical: -0.1 } }), // negative
      JSON.stringify({ weights: { ...DEFAULT_WEIGHTS, technical: "0.5" } }), // string
      JSON.stringify({ weights: { ...DEFAULT_WEIGHTS, technical: null } }), // null
    ];

    for (const payload of invalidWeightPayloads) {
      expect(parseSettings(payload)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("roundtrips settings faithfully through JSON serialization", () => {
    const initial: Settings = {
      weights: { ...DEFAULT_WEIGHTS, technical: 0.5 },
      presetId: null,
      ringBrand: "btmh",
    };
    const serialized = JSON.stringify(initial);
    const roundtripped = parseSettings(serialized);
    expect(roundtripped).toEqual(initial);
  });
});
