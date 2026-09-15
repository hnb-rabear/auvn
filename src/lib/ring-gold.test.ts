import { describe, it, expect } from "vitest";
import {
  ringBrand,
  validRingQuote,
  mergeRingQuote,
  ringQuoteAt,
  type RingQuote,
  type RingGoldDay,
} from "./ring-gold";

describe("ring-gold contracts and helpers", () => {
  const q: RingQuote = {
    buy: 142_500_000,
    sell: 146_500_000,
    product: "Nhẫn tròn trơn 9999",
    source: "https://btmc.vn/gia-vang-theo-ngay.html",
    publishedAt: "2026-09-15T08:50:00+07:00",
    fetchedAt: "2026-09-15T02:00:00Z",
  };

  describe("ringBrand", () => {
    it("returns btmh for btmh, btmc for anything else", () => {
      expect(ringBrand("sjc")).toBe("btmc");
      expect(ringBrand("btmh")).toBe("btmh");
      expect(ringBrand("btmc")).toBe("btmc");
      expect(ringBrand("PNJ")).toBe("btmc");
      expect(ringBrand(null)).toBe("btmc");
      expect(ringBrand(undefined)).toBe("btmc");
      expect(ringBrand(123)).toBe("btmc");
      expect(ringBrand({})).toBe("btmc");
    });
  });

  describe("validRingQuote", () => {
    it("validates well-formed quote fixture", () => {
      expect(validRingQuote(q)).toBe(true);
    });

    it("rejects non-object or null values", () => {
      expect(validRingQuote(null)).toBe(false);
      expect(validRingQuote(undefined)).toBe(false);
      expect(validRingQuote("string")).toBe(false);
      expect(validRingQuote(123)).toBe(false);
      expect(validRingQuote([])).toBe(false);
    });

    it("rejects invalid buy/sell values", () => {
      expect(validRingQuote({ ...q, buy: null })).toBe(false);
      expect(validRingQuote({ ...q, sell: null })).toBe(false);
      expect(validRingQuote({ ...q, buy: undefined })).toBe(false);
      expect(validRingQuote({ ...q, buy: NaN })).toBe(false);
      expect(validRingQuote({ ...q, sell: Infinity })).toBe(false);
      expect(validRingQuote({ ...q, buy: "142500000" })).toBe(false);
      // buy > sell
      expect(validRingQuote({ ...q, buy: q.sell + 1 })).toBe(false);
      // outside 50-600M VND/lượng band
      expect(validRingQuote({ ...q, buy: 49_999_999 })).toBe(false);
      expect(validRingQuote({ ...q, sell: 600_000_001 })).toBe(false);
      expect(validRingQuote({ ...q, buy: 0 })).toBe(false);
      expect(validRingQuote({ ...q, buy: -100_000_000 })).toBe(false);
    });

    it("rejects invalid product or source", () => {
      expect(validRingQuote({ ...q, product: "" })).toBe(false);
      expect(validRingQuote({ ...q, product: "   " })).toBe(false);
      expect(validRingQuote({ ...q, product: 123 })).toBe(false);
      expect(validRingQuote({ ...q, source: "" })).toBe(false);
      expect(validRingQuote({ ...q, source: "   " })).toBe(false);
      expect(validRingQuote({ ...q, source: null })).toBe(false);
    });

    it("handles publishedAt null (source without time)", () => {
      expect(validRingQuote({ ...q, publishedAt: null })).toBe(true);
    });

    it("rejects timestamps without timezone", () => {
      expect(validRingQuote({ ...q, publishedAt: "2026-09-15T08:50:00" })).toBe(false);
      expect(validRingQuote({ ...q, fetchedAt: "2026-09-15T02:00:00" })).toBe(false);
    });

    it("requires fetchedAt to be UTC timezone", () => {
      expect(validRingQuote({ ...q, fetchedAt: "2026-09-15T09:00:00+07:00" })).toBe(false);
      expect(validRingQuote({ ...q, fetchedAt: "2026-09-15T02:00:00+00:00" })).toBe(true);
      expect(validRingQuote({ ...q, fetchedAt: "2026-09-15T02:00:00Z" })).toBe(true);
    });

    it("rejects invalid calendar dates without JS normalization", () => {
      // Feb 31 does not exist
      expect(validRingQuote({ ...q, publishedAt: "2026-02-31T08:50:00+07:00" })).toBe(false);
      // Feb 29 in non-leap year (2026 is not leap)
      expect(validRingQuote({ ...q, fetchedAt: "2026-02-29T02:00:00Z" })).toBe(false);
      // April 31 does not exist
      expect(validRingQuote({ ...q, publishedAt: "2026-04-31T08:50:00+07:00" })).toBe(false);
      // Month 13
      expect(validRingQuote({ ...q, publishedAt: "2026-13-01T08:50:00+07:00" })).toBe(false);
      // Hour 24
      expect(validRingQuote({ ...q, publishedAt: "2026-09-15T24:00:00+07:00" })).toBe(false);
    });

    it("rejects future source time within same day (publishedAt > fetchedAt)", () => {
      // fetchedAt is 02:00:00Z (09:00 VN); publishedAt is 10:00:00+07:00 (03:00:00Z)
      expect(
        validRingQuote({
          ...q,
          publishedAt: "2026-09-15T10:00:00+07:00",
          fetchedAt: "2026-09-15T02:00:00Z",
        })
      ).toBe(false);
    });

    it("rejects source dates not matching fetchedAt VN date", () => {
      // publishedAt VN date is 2026-09-14, fetchedAt VN date is 2026-09-15
      expect(
        validRingQuote({
          ...q,
          publishedAt: "2026-09-14T08:50:00+07:00",
          fetchedAt: "2026-09-15T02:00:00Z",
        })
      ).toBe(false);
      // publishedAt VN date is 2026-09-16 (future date)
      expect(
        validRingQuote({
          ...q,
          publishedAt: "2026-09-16T08:50:00+07:00",
          fetchedAt: "2026-09-15T02:00:00Z",
        })
      ).toBe(false);
    });

    it("accepts valid quote deterministically regardless of execution date", () => {
      expect(
        validRingQuote({
          ...q,
          fetchedAt: "2020-01-01T02:00:00Z",
          publishedAt: "2020-01-01T08:50:00+07:00",
        })
      ).toBe(true);
      expect(
        validRingQuote({
          ...q,
          fetchedAt: "2099-01-01T02:00:00Z",
          publishedAt: "2099-01-01T08:50:00+07:00",
        })
      ).toBe(true);
    });
  });

  describe("mergeRingQuote and ringQuoteAt", () => {
    it("satisfies specification contract from task brief", () => {
      const rows = mergeRingQuote([], "btmc", q);
      expect(ringQuoteAt(rows, "btmh", "2026-09-15", false)).toBeNull();
      expect(ringQuoteAt(rows, "btmc", "2026-09-14", false)).toBeNull();
      expect(ringQuoteAt(rows, "btmc", "2026-09-16", true)).toBeNull();
      expect(ringQuoteAt(rows, "btmc", "2026-09-16", false)).toEqual(q);
    });

    it("merges two brands on same day without overwriting each other", () => {
      const qBtmh: RingQuote = {
        buy: 142_000_000,
        sell: 146_000_000,
        product: "Kim Gia Bảo 24K",
        source: "https://baotinmanhhai.vn/bang-gia-vang",
        publishedAt: "2026-09-15T08:30:00+07:00",
        fetchedAt: "2026-09-15T02:00:00Z",
      };

      const rows1 = mergeRingQuote([], "btmc", q);
      const rows2 = mergeRingQuote(rows1, "btmh", qBtmh);

      expect(rows2.length).toBe(1);
      expect(rows2[0].date).toBe("2026-09-15");
      expect(ringQuoteAt(rows2, "btmc", "2026-09-15", true)).toEqual(q);
      expect(ringQuoteAt(rows2, "btmh", "2026-09-15", true)).toEqual(qBtmh);
    });

    it("does not downgrade newer session with older source quote", () => {
      const rows1 = mergeRingQuote([], "btmc", q);
      const qOlder: RingQuote = {
        ...q,
        publishedAt: "2026-09-15T07:00:00+07:00",
        buy: 141_000_000,
        sell: 145_000_000,
      };

      const rows2 = mergeRingQuote(rows1, "btmc", qOlder);
      expect(rows2).toBe(rows1); // returns same reference
      expect(ringQuoteAt(rows2, "btmc", "2026-09-15", true)).toEqual(q);
    });

    it("updates when newer source quote arrives in same day", () => {
      const rows1 = mergeRingQuote([], "btmc", q);
      const qNewer: RingQuote = {
        ...q,
        publishedAt: "2026-09-15T09:30:00+07:00",
        fetchedAt: "2026-09-15T02:40:00Z",
        buy: 142_800_000,
        sell: 146_800_000,
      };

      const rows2 = mergeRingQuote(rows1, "btmc", qNewer);
      expect(rows2).not.toBe(rows1);
      expect(ringQuoteAt(rows2, "btmc", "2026-09-15", true)).toEqual(qNewer);
    });

    it("no-ops and avoids git diff when same publishedAt and same prices", () => {
      const rows1 = mergeRingQuote([], "btmc", q);
      const qSamePrices: RingQuote = {
        ...q,
        fetchedAt: "2026-09-15T03:00:00Z", // fetched later but same published quote
      };

      const rows2 = mergeRingQuote(rows1, "btmc", qSamePrices);
      expect(rows2).toBe(rows1); // exactly same reference
      expect(ringQuoteAt(rows2, "btmc", "2026-09-15", true)?.fetchedAt).toBe("2026-09-15T02:00:00Z");
    });

    it("correctly maps VN date across UTC midnight", () => {
      // 2026-09-14T20:00:00Z is 2026-09-15T03:00:00+07:00 in VN
      const qMidnight: RingQuote = {
        ...q,
        publishedAt: "2026-09-15T03:00:00+07:00",
        fetchedAt: "2026-09-14T20:00:00Z",
      };

      const rows = mergeRingQuote([], "btmc", qMidnight);
      expect(rows.length).toBe(1);
      expect(rows[0].date).toBe("2026-09-15");
      expect(ringQuoteAt(rows, "btmc", "2026-09-15", true)).toEqual(qMidnight);
    });

    it("preserves stored publishedAt and returns same reference when incoming quote has publishedAt null at same prices", () => {
      const rows1 = mergeRingQuote([], "btmc", q);
      const qNoPubSamePrice: RingQuote = {
        ...q,
        publishedAt: null,
        fetchedAt: "2026-09-15T06:30:00Z",
      };

      const rows2 = mergeRingQuote(rows1, "btmc", qNoPubSamePrice);
      expect(rows2).toBe(rows1);
      const stored = ringQuoteAt(rows2, "btmc", "2026-09-15", true);
      expect(stored?.publishedAt).toBe(q.publishedAt);
      expect(stored?.fetchedAt).toBe(q.fetchedAt);
    });

    it("does not invent publishedAt when source quote has publishedAt null", () => {
      const qNoPub: RingQuote = {
        ...q,
        publishedAt: null,
      };

      const rows = mergeRingQuote([], "btmc", qNoPub);
      expect(rows.length).toBe(1);
      expect(rows[0].date).toBe("2026-09-15");
      const saved = ringQuoteAt(rows, "btmc", "2026-09-15", true);
      expect(saved).not.toBeNull();
      expect(saved?.publishedAt).toBeNull();
    });

    it("handles publishedAt missing on one or both sides with fetchedAt comparison", () => {
      const qNoPub1: RingQuote = {
        ...q,
        publishedAt: null,
        fetchedAt: "2026-09-15T02:00:00Z",
      };
      const rows1 = mergeRingQuote([], "btmc", qNoPub1);

      // Same null publishedAt, same price, later fetchedAt -> no-op
      const qNoPub2: RingQuote = {
        ...qNoPub1,
        fetchedAt: "2026-09-15T03:00:00Z",
      };
      const rows2 = mergeRingQuote(rows1, "btmc", qNoPub2);
      expect(rows2).toBe(rows1);

      // Newer fetch with price change -> updates
      const qNoPub3: RingQuote = {
        ...qNoPub1,
        fetchedAt: "2026-09-15T04:00:00Z",
        buy: 143_000_000,
        sell: 147_000_000,
      };
      const rows3 = mergeRingQuote(rows1, "btmc", qNoPub3);
      expect(rows3).not.toBe(rows1);
      expect(ringQuoteAt(rows3, "btmc", "2026-09-15", true)?.buy).toBe(143_000_000);
      expect(ringQuoteAt(rows3, "btmc", "2026-09-15", true)?.publishedAt).toBeNull();
    });

    it("rejects invalid quotes without mutating history", () => {
      const rows1 = mergeRingQuote([], "btmc", q);
      const rowsInvalid = mergeRingQuote(rows1, "btmc", { ...q, buy: null } as unknown as RingQuote);
      expect(rowsInvalid).toBe(rows1);
    });

    it("does not mutate original history array", () => {
      const initial: RingGoldDay[] = [];
      const res = mergeRingQuote(initial, "btmc", q);
      expect(initial).toHaveLength(0);
      expect(res).toHaveLength(1);
    });
  });
});
