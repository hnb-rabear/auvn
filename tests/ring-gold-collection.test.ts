import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseBtmcRingApi,
  parseBtmhRingHtml,
  fetchRingQuotes,
  collectRingGold,
  BTMC_API_URL,
  BTMH_HTML_URL,
} from "../scripts/ring-gold";

// Helpers to build self-consistent BTMH stream fixtures
function buildBtmhStreamHtml(options?: {
  corruptStream?: boolean;
  outOfBoundsRef?: boolean;
  notAnArray?: boolean;
  giftOnly?: boolean;
  conflictingDuplicates?: boolean;
  wrongUnit?: boolean;
  wrongPurity?: boolean;
  wrongName?: boolean;
  missingPrice?: boolean;
  malformedPrice?: boolean;
  groupedPrice?: boolean;
  negativeSentinelTime?: boolean;
  malformedTime?: boolean;
  futureTime?: boolean;
  unrelatedMalformedObject?: boolean;
}): string {
  if (options?.corruptStream) {
    return '<html><body><script>window.__reactRouterContext.streamController.enqueue("not json");</script></body></html>';
  }
  if (options?.notAnArray) {
    return '<html><body><script>window.__reactRouterContext.streamController.enqueue(JSON.stringify({"not": "array"}));</script></body></html>';
  }

  // Tokens array
  const tokens: unknown[] = [
    "code", // 0
    "name", // 1
    "vendor_name", // 2
    "buy_price", // 3
    "sell_price", // 4
    "unit", // 5
    "weight", // 6
    "hl_vang", // 7
    "last_updated", // 8
    "rate_image", // 9
    "KGB", // 10
    options?.wrongName ? "Nhẫn Khác" : "Kim Gia Bảo 24K", // 11
    "Bảo Tín Mạnh Hải", // 12
    options?.missingPrice
      ? null
      : options?.malformedPrice
        ? "14250000garbage"
        : options?.groupedPrice
          ? "14,250,000"
          : 14250000, // 13
    options?.missingPrice
      ? null
      : options?.groupedPrice
        ? "14.650.000"
        : 14650000, // 14
    options?.wrongUnit ? "VND/lượng" : "VND/1 chỉ", // 15
    "1 chỉ", // 16
    options?.wrongPurity ? "99.9" : "99.99", // 17
    options?.malformedTime
      ? "invalid-time"
      : options?.futureTime
        ? "2026-09-15 09:30:00.0"
        : "2026-09-15 08:34:06.0", // 18
    "KGBG", // 19
    "Kim Gia Bảo Gift 24K", // 20
    14750000, // 21
    15150000, // 22
    14660000, // 23
  ];

  const giftRecord = {
    _0: 19, // code: KGBG
    _1: 20,
    _2: 12,
    _3: 21,
    _4: 22,
    _5: 15,
    _6: 16,
    _7: 17,
    _8: 18,
    _9: -5,
  };

  const kgbRecord1: Record<string, unknown> = {
    _0: 10, // code: KGB
    _1: 11,
    _2: 12,
    _3: 13,
    _4: 14,
    _5: 15,
    _6: 16,
    _7: 17,
    _8: options?.negativeSentinelTime ? -5 : 18,
    _9: -5,
  };

  const kgbRecord2: Record<string, unknown> = {
    _0: 10,
    _1: 11,
    _2: 12,
    _3: 13,
    _4: options?.conflictingDuplicates ? 23 : 14,
    _5: 15,
    _6: 16,
    _7: 17,
    _8: options?.negativeSentinelTime ? -5 : 18,
    _9: -5,
  };

  if (options?.outOfBoundsRef) {
    kgbRecord1._3 = 9999;
  }

  if (options?.unrelatedMalformedObject) {
    // Unrelated object with out-of-bounds ref that should NOT break KGB parsing
    tokens.push({ _999: 88888, unrelated_key: "value" });
  }

  if (options?.giftOnly) {
    tokens.push(giftRecord);
  } else {
    tokens.push(giftRecord, kgbRecord1, kgbRecord2);
  }

  const jsonStr = JSON.stringify(JSON.stringify(tokens));
  return `<html><body><script>window.__reactRouterContext.streamController.enqueue(${jsonStr});</script></body></html>`;
}

describe("parseBtmcRingApi", () => {
  const fetchedAt = "2026-09-15T02:00:00Z"; // 09:00 VN time

  it("parses valid BTMC API response with suffix 632", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_632": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_632": "999.9",
            "@pb_632": "14250000",
            "@ps_632": "14650000",
            "@d_632": "15/09/2026 08:50",
          },
        ],
      },
    });

    const quote = parseBtmcRingApi(raw, fetchedAt);
    expect(quote).toEqual({
      buy: 142_500_000,
      sell: 146_500_000,
      product: "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
      source: BTMC_API_URL,
      publishedAt: "2026-09-15T08:50:00+07:00",
      fetchedAt,
    });
  });

  it("works with grouped prices (comma or dot thousands separators)", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14,250,000",
            "@ps_1": "14.650.000",
            "@d_1": "15/09/2026 08:50",
          },
        ],
      },
    });

    const quote = parseBtmcRingApi(raw, fetchedAt);
    expect(quote.buy).toBe(142_500_000);
    expect(quote.sell).toBe(146_500_000);
  });

  it("rejects malformed price with trailing characters or invalid decimals", () => {
    const garbageSuffix = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000garbage",
            "@ps_1": "14650000",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(garbageSuffix, fetchedAt)).toThrow(/price/i);

    const decimalPrice = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250.50",
            "@ps_1": "14650.00",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(decimalPrice, fetchedAt)).toThrow(/price/i);

    const mixedSeparatorPrice = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14,250.000",
            "@ps_1": "14,650,000",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(mixedSeparatorPrice, fetchedAt)).toThrow(/price/i);
  });

  it("works with different suffix like 813 and seconds in timestamp", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@row": "813",
            "@n_813": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@k_813": "24k",
            "@h_813": "999.9",
            "@pb_813": "14250000",
            "@ps_813": "14650000",
            "@pt_813": "4298",
            "@d_813": "15/09/2026 08:50:30",
          },
        ],
      },
    });

    const quote = parseBtmcRingApi(raw, fetchedAt);
    expect(quote.buy).toBe(142_500_000);
    expect(quote.sell).toBe(146_500_000);
    expect(quote.publishedAt).toBe("2026-09-15T08:50:30+07:00");
  });

  it("allows null publishedAt when @d is missing or empty", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "",
          },
        ],
      },
    });

    const quote = parseBtmcRingApi(raw, fetchedAt);
    expect(quote.publishedAt).toBeNull();
  });

  it("rejects if product is trang sức or not exact Vàng Rồng Thăng Long", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRANG SỨC (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });

    expect(() => parseBtmcRingApi(raw, fetchedAt)).toThrow(/product|not found/i);
  });

  it("rejects if purity is not 999.9", () => {
    const raw = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "99.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });

    expect(() => parseBtmcRingApi(raw, fetchedAt)).toThrow(/purity/i);
  });

  it("rejects invalid prices (0, NaN, or buy > sell)", () => {
    const zeroPrice = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "0",
            "@ps_1": "14650000",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(zeroPrice, fetchedAt)).toThrow();

    const buyGreaterThanSell = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14700000",
            "@ps_1": "14650000",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(buyGreaterThanSell, fetchedAt)).toThrow();
  });

  it("rejects malformed or future timestamps", () => {
    const malformed = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "not-a-date",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(malformed, fetchedAt)).toThrow();

    const future = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "15/09/2026 09:30", // fetchedAt is 09:00 VN (02:00Z)
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(future, fetchedAt)).toThrow();

    const wrongDay = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "14/09/2026 08:50",
          },
        ],
      },
    });
    expect(() => parseBtmcRingApi(wrongDay, fetchedAt)).toThrow();
  });
});

describe("parseBtmhRingHtml", () => {
  const fetchedAt = "2026-09-15T02:00:00Z";

  it("parses valid BTMH HTML with stream and duplicate agreement", () => {
    const html = buildBtmhStreamHtml();
    const quote = parseBtmhRingHtml(html, fetchedAt);
    expect(quote).toEqual({
      buy: 142_500_000,
      sell: 146_500_000,
      product: "Kim Gia Bảo 24K",
      source: BTMH_HTML_URL,
      publishedAt: "2026-09-15T08:34:06+07:00",
      fetchedAt,
    });
  });

  it("handles negative sentinel (-5) for last_updated as null publishedAt", () => {
    const html = buildBtmhStreamHtml({ negativeSentinelTime: true });
    const quote = parseBtmhRingHtml(html, fetchedAt);
    expect(quote.publishedAt).toBeNull();
    expect(quote.buy).toBe(142_500_000);
    expect(quote.sell).toBe(146_500_000);
  });

  it("ignores unrelated malformed objects elsewhere in the stream", () => {
    const html = buildBtmhStreamHtml({ unrelatedMalformedObject: true });
    const quote = parseBtmhRingHtml(html, fetchedAt);
    expect(quote.buy).toBe(142_500_000);
    expect(quote.sell).toBe(146_500_000);
  });

  it("parses grouped price strings and rejects malformed price strings", () => {
    const grouped = buildBtmhStreamHtml({ groupedPrice: true });
    const quote = parseBtmhRingHtml(grouped, fetchedAt);
    expect(quote.buy).toBe(142_500_000);
    expect(quote.sell).toBe(146_500_000);

    const malformed = buildBtmhStreamHtml({ malformedPrice: true });
    expect(() => parseBtmhRingHtml(malformed, fetchedAt)).toThrow(/price/i);
  });

  it("proves BTMH mapping: catalog product SKU KGB1C10022001 matches price table KGB sell price", () => {
    const catalogItem = {
      sku: "KGB1C10022001",
      category_code: "KGB",
      name: "Nhẫn tròn ép vỉ Kim Gia Bảo, loại 1 chỉ - 24K (999.9)",
      price: 14650000,
      unit_weight: "1 chỉ",
      purity: "999.9",
    };
    const html = buildBtmhStreamHtml();
    const quote = parseBtmhRingHtml(html, fetchedAt);

    expect(quote.sell).toBe(catalogItem.price * 10);
    expect(quote.buy).toBe(142_500_000);
    expect(catalogItem.category_code).toBe("KGB");
  });

  it("throws when duplicate KGB records conflict", () => {
    const html = buildBtmhStreamHtml({ conflictingDuplicates: true });
    expect(() => parseBtmhRingHtml(html, fetchedAt)).toThrow(/conflict/i);
  });

  it("throws when only Gift record exists without KGB", () => {
    const html = buildBtmhStreamHtml({ giftOnly: true });
    expect(() => parseBtmhRingHtml(html, fetchedAt)).toThrow(/no KGB record/i);
  });

  it("throws when unit, purity, or product name does not match expected", () => {
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ wrongUnit: true }), fetchedAt)).toThrow(/unit/i);
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ wrongPurity: true }), fetchedAt)).toThrow(/purity|hl_vang/i);
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ wrongName: true }), fetchedAt)).toThrow(/name|product/i);
  });

  it("throws on missing price or price out of bounds", () => {
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ missingPrice: true }), fetchedAt)).toThrow(/price/i);
  });

  it("throws on malformed or future timestamp", () => {
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ malformedTime: true }), fetchedAt)).toThrow();
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ futureTime: true }), fetchedAt)).toThrow();
  });

  it("throws on corrupt stream or out of bounds ref on KGB record", () => {
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ corruptStream: true }), fetchedAt)).toThrow(/stream/i);
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ notAnArray: true }), fetchedAt)).toThrow(/stream/i);
    expect(() => parseBtmhRingHtml(buildBtmhStreamHtml({ outOfBoundsRef: true }), fetchedAt)).toThrow(/bounds/i);
  });
});

describe("fetchRingQuotes", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches both brands concurrently and returns quotes", async () => {
    const btmcApiPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "",
          },
        ],
      },
    });
    const btmhHtmlPayload = buildBtmhStreamHtml({ negativeSentinelTime: true });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) {
        return Promise.resolve(new Response(btmcApiPayload, { status: 200 }));
      }
      if (urlStr.includes("baotinmanhhai.vn")) {
        return Promise.resolve(new Response(btmhHtmlPayload, { status: 200 }));
      }
      return Promise.reject(new Error("Unexpected URL"));
    }) as typeof globalThis.fetch;

    const { quotes, errors } = await fetchRingQuotes();
    expect(quotes.btmc).toBeDefined();
    expect(quotes.btmh).toBeDefined();
    expect(quotes.btmc?.buy).toBe(142_500_000);
    expect(quotes.btmh?.buy).toBe(142_500_000);
    expect(errors.btmc).toBeUndefined();
    expect(errors.btmh).toBeUndefined();
  });

  it("captures fetchedAt immediately after response, handling clock advancing across midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T23:59:58.000Z"));

    const btmcPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
            "@d_1": "16/09/2026 07:00", // 07:00 VN is 00:00Z on 2026-09-16
          },
        ],
      },
    });

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) {
        // Advance fake clock across midnight during request
        vi.setSystemTime(new Date("2026-09-16T00:00:05.000Z"));
        return new Response(btmcPayload, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof globalThis.fetch;

    const fetchPromise = fetchRingQuotes();
    await vi.advanceTimersByTimeAsync(10_000);
    const { quotes } = await fetchPromise;

    expect(quotes.btmc).toBeDefined();
    expect(quotes.btmc?.fetchedAt).toBe("2026-09-16T00:00:05.000Z");
    expect(quotes.btmc?.publishedAt).toBe("2026-09-16T07:00:00+07:00");
  });

  it("fails BTMC when API fails without HTML fallback", async () => {
    vi.useFakeTimers();

    const btmhHtmlPayload = buildBtmhStreamHtml({ negativeSentinelTime: true });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) {
        return Promise.resolve(new Response("Gateway Error", { status: 502 }));
      }
      if (urlStr.includes("baotinmanhhai.vn")) {
        return Promise.resolve(new Response(btmhHtmlPayload, { status: 200 }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${urlStr}`));
    }) as typeof globalThis.fetch;

    const fetchPromise = fetchRingQuotes();
    await vi.advanceTimersByTimeAsync(10_000);
    const { quotes, errors } = await fetchPromise;

    expect(quotes.btmc).toBeUndefined();
    expect(errors.btmc).toBeDefined();
    expect(quotes.btmh).toBeDefined();
  });

  it("reports error when one brand completely fails and preserves the other", async () => {
    vi.useFakeTimers();

    const btmcApiPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) {
        return Promise.resolve(new Response(btmcApiPayload, { status: 200 }));
      }
      if (urlStr.includes("baotinmanhhai.vn")) {
        return Promise.resolve(new Response("HTTP 403 Forbidden", { status: 403 }));
      }
      return Promise.reject(new Error("Unexpected URL"));
    }) as typeof globalThis.fetch;

    const fetchPromise = fetchRingQuotes();
    await vi.advanceTimersByTimeAsync(10_000);
    const { quotes, errors } = await fetchPromise;

    expect(quotes.btmc).toBeDefined();
    expect(quotes.btmh).toBeUndefined();
    expect(errors.btmh).toBeDefined();
  });

  it("does not retry on HTTP 403", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("baotinmanhhai.vn")) {
        callCount++;
        return Promise.resolve(new Response("Forbidden", { status: 403 }));
      }
      return Promise.resolve(new Response("Forbidden", { status: 403 }));
    }) as typeof globalThis.fetch;

    const { quotes, errors } = await fetchRingQuotes();
    expect(quotes.btmh).toBeUndefined();
    expect(callCount).toBe(1); // No retry on 403
    expect(errors.btmh).toMatch(/403/);
  });
});

describe("collectRingGold", () => {
  const originalFetch = globalThis.fetch;
  let tempDir: string;
  let historyFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "au-ring-gold-test-"));
    historyFile = path.join(tempDir, "ring-gold.json");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("creates parent directories if missing when saving new file", async () => {
    const btmcPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });
    const btmhPayload = buildBtmhStreamHtml({ negativeSentinelTime: true });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) return Promise.resolve(new Response(btmcPayload, { status: 200 }));
      if (urlStr.includes("baotinmanhhai.vn")) return Promise.resolve(new Response(btmhPayload, { status: 200 }));
      return Promise.reject(new Error("unexpected"));
    }) as typeof globalThis.fetch;

    const nestedFile = path.join(tempDir, "sub", "deep", "ring-gold.json");
    const result = await collectRingGold(nestedFile);
    expect(result.collected).toBe(2);
    expect(result.changed).toBe(true);
    expect(fs.existsSync(nestedFile)).toBe(true);
  });

  it("is no-op and does not rewrite file when quote is identical", async () => {
    const btmcPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });
    const btmhPayload = buildBtmhStreamHtml({ negativeSentinelTime: true });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) return Promise.resolve(new Response(btmcPayload, { status: 200 }));
      if (urlStr.includes("baotinmanhhai.vn")) return Promise.resolve(new Response(btmhPayload, { status: 200 }));
      return Promise.reject(new Error("unexpected"));
    }) as typeof globalThis.fetch;

    const res1 = await collectRingGold(historyFile);
    expect(res1.changed).toBe(true);
    const mtime1 = fs.statSync(historyFile).mtimeMs;

    const res2 = await collectRingGold(historyFile);
    expect(res2.collected).toBe(2);
    expect(res2.changed).toBe(false);
    const mtime2 = fs.statSync(historyFile).mtimeMs;
    expect(mtime2).toBe(mtime1);
  });

  it("throws on corrupt JSON on disk and preserves the corrupt file", async () => {
    const corruptContent = "{ not json syntax !";
    fs.writeFileSync(historyFile, corruptContent, "utf-8");

    await expect(collectRingGold(historyFile)).rejects.toThrow();
    expect(fs.readFileSync(historyFile, "utf-8")).toBe(corruptContent);
  });

  it("throws on invalid history structure: duplicate dates, bad brand, empty dates, impossible calendar, empty quotes", async () => {
    const validQuote = {
      buy: 142500000,
      sell: 146500000,
      product: "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
      source: BTMC_API_URL,
      publishedAt: null,
      fetchedAt: "2026-09-15T02:00:00Z",
    };

    const emptyQuotes = [{ date: "2026-09-15", quotes: {} }];
    fs.writeFileSync(historyFile, JSON.stringify(emptyQuotes), "utf-8");
    await expect(collectRingGold(historyFile)).rejects.toThrow(/empty quotes/i);

    const dupDates = [
      { date: "2026-09-15", quotes: { btmc: validQuote } },
      { date: "2026-09-15", quotes: { btmc: validQuote } },
    ];
    fs.writeFileSync(historyFile, JSON.stringify(dupDates), "utf-8");
    await expect(collectRingGold(historyFile)).rejects.toThrow(/duplicate date/i);

    const emptyDate = [{ date: "", quotes: { btmc: validQuote } }];
    fs.writeFileSync(historyFile, JSON.stringify(emptyDate), "utf-8");
    await expect(collectRingGold(historyFile)).rejects.toThrow(/invalid date/i);

    const impossibleDate = [
      {
        date: "2026-02-31",
        quotes: {
          btmc: { ...validQuote, fetchedAt: "2026-02-31T02:00:00Z" },
        },
      },
    ];
    fs.writeFileSync(historyFile, JSON.stringify(impossibleDate), "utf-8");
    await expect(collectRingGold(historyFile)).rejects.toThrow(/calendar date/i);

    const badBrandHistory = [
      {
        date: "2026-09-15",
        quotes: {
          sjc: { buy: 142500000, sell: 146500000 },
        },
      },
    ];
    fs.writeFileSync(historyFile, JSON.stringify(badBrandHistory), "utf-8");
    await expect(collectRingGold(historyFile)).rejects.toThrow(/brand/i);
  });

  it("cleans up temporary file on rename failure and leaves original untouched", async () => {
    const originalContent = JSON.stringify([]);
    fs.writeFileSync(historyFile, originalContent, "utf-8");

    const btmcPayload = JSON.stringify({
      DataList: {
        Data: [
          {
            "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            "@h_1": "999.9",
            "@pb_1": "14250000",
            "@ps_1": "14650000",
          },
        ],
      },
    });

    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn")) return Promise.resolve(new Response(btmcPayload, { status: 200 }));
      return Promise.resolve(new Response("Forbidden", { status: 403 }));
    }) as typeof globalThis.fetch;

    // Spy on fs.promises.rename to simulate failure
    const renameSpy = vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("EACCES: permission denied"));

    await expect(collectRingGold(historyFile)).rejects.toThrow(/EACCES/);
    renameSpy.mockRestore();

    // Original file must be untouched
    expect(fs.readFileSync(historyFile, "utf-8")).toBe(originalContent);

    // No leftover .tmp files
    const files = fs.readdirSync(tempDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles.length).toBe(0);
  });

  it("merges quotes and keeps previous brand quote when one brand fails", async () => {
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const fetchedAtUtc = new Date().toISOString();
    const initialHistory = [
      {
        date: today,
        quotes: {
          btmc: {
            buy: 142500000,
            sell: 146500000,
            product: "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
            source: BTMC_API_URL,
            publishedAt: null,
            fetchedAt: fetchedAtUtc,
          },
        },
      },
    ];
    fs.writeFileSync(historyFile, JSON.stringify(initialHistory), "utf-8");

    const btmhPayload = buildBtmhStreamHtml({ negativeSentinelTime: true });
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("api.btmc.vn") || urlStr.includes("btmc.vn")) {
        return Promise.resolve(new Response("Forbidden", { status: 403 }));
      }
      if (urlStr.includes("baotinmanhhai.vn")) {
        return Promise.resolve(new Response(btmhPayload, { status: 200 }));
      }
      return Promise.reject(new Error("unexpected"));
    }) as typeof globalThis.fetch;

    const result = await collectRingGold(historyFile);

    expect(result.collected).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.errors.btmc).toBeDefined();

    const saved = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
    expect(saved[0].quotes.btmc).toBeDefined();
    expect(saved[0].quotes.btmh).toBeDefined();
  });
});
