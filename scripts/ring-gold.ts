import * as fs from "node:fs";
import * as path from "node:path";
import type { RingBrand, RingGoldDay, RingQuote } from "../src/lib/ring-gold";
import { validRingQuote, mergeRingQuote } from "../src/lib/ring-gold";

export const BTMC_API_URL =
  "https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v";
export const BTMH_HTML_URL = "https://baotinmanhhai.vn/bang-gia-vang";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 3_000;

function toVnDateString(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

function parseStrictInt(val: unknown): number | null {
  if (typeof val === "number") {
    return Number.isSafeInteger(val) && val > 0 ? val : null;
  }
  if (typeof val !== "string") return null;
  const s = val.trim();
  if (
    !/^\d+$/.test(s) &&
    !/^\d{1,3}(?:,\d{3})+$/.test(s) &&
    !/^\d{1,3}(?:\.\d{3})+$/.test(s)
  ) {
    return null;
  }
  const n = Number(s.replace(/[.,]/g, ""));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseBtmcPublishedAt(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) throw new Error(`btmc: malformed timestamp "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+07:00`;
}

function parseBtmhPublishedAt(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new Error("btmh: non-string last_updated");
  const s = raw.trim();
  if (s === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`btmh: malformed timestamp "${s}"`);
  const frac = m[7] && m[7] !== "0" ? `.${m[7]}` : "";
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${frac}+07:00`;
}

export function parseBtmcRingApi(text: string, fetchedAt: string): RingQuote {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("btmc api: invalid JSON payload");
  }

  const data = (json as Record<string, unknown>)?.DataList as { Data?: unknown[] } | undefined;
  if (!Array.isArray(data?.Data) || data.Data.length === 0) {
    throw new Error("btmc api: empty or invalid Data array");
  }

  let foundRow: Record<string, unknown> | null = null;
  let rowIdx: string | null = null;
  for (const row of data.Data as Record<string, unknown>[]) {
    const key = Object.keys(row).find((k) => k.startsWith("@n_"));
    if (!key) continue;
    const idx = key.slice(3);
    const name = String(row[key] ?? "").trim();
    if (name === "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)") {
      foundRow = row;
      rowIdx = idx;
      break;
    }
  }

  if (!foundRow || !rowIdx) {
    throw new Error("btmc api: row 'NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)' not found");
  }

  if (String(foundRow[`@h_${rowIdx}`] ?? "").trim() !== "999.9") {
    throw new Error("btmc api: invalid purity, expected 999.9");
  }

  const rawBuy = parseStrictInt(foundRow[`@pb_${rowIdx}`]);
  const rawSell = parseStrictInt(foundRow[`@ps_${rowIdx}`]);
  if (rawBuy === null || rawSell === null) {
    throw new Error("btmc api: invalid or missing buy/sell price");
  }

  const buy = rawBuy * 10;
  const sell = rawSell * 10;
  if (buy > sell) {
    throw new Error(`btmc api: buy price (${buy}) > sell price (${sell})`);
  }

  const quote: RingQuote = {
    buy,
    sell,
    product: "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
    source: BTMC_API_URL,
    publishedAt: parseBtmcPublishedAt(foundRow[`@d_${rowIdx}`]),
    fetchedAt,
  };

  if (!validRingQuote(quote)) {
    throw new Error("btmc api: generated quote failed validRingQuote");
  }
  return quote;
}

export function parseBtmhRingHtml(text: string, fetchedAt: string): RingQuote {
  const match = text.match(
    /window\.__reactRouterContext\.streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/
  );
  if (!match) throw new Error("btmh: missing quote stream");

  let values: unknown[];
  try {
    values = JSON.parse(JSON.parse(match[1]));
  } catch {
    throw new Error("btmh: invalid quote stream JSON");
  }
  if (!Array.isArray(values)) throw new Error("btmh: invalid quote stream (not an array)");

  const codeKeyIdx = values.indexOf("code");
  const kgbValIdx = values.indexOf("KGB");
  if (codeKeyIdx === -1 || kgbValIdx === -1) throw new Error("btmh: no KGB record found");

  const codeProp = `_${codeKeyIdx}`;
  const WHITELIST_KEYS = [
    "code",
    "name",
    "buy_price",
    "sell_price",
    "unit",
    "weight",
    "hl_vang",
    "last_updated",
  ] as const;

  const keyIndices = new Map<string, number>();
  for (const k of WHITELIST_KEYS) {
    const idx = values.indexOf(k);
    if (idx !== -1) keyIndices.set(k, idx);
  }

  const kgbRecords: Record<string, unknown>[] = [];
  for (const item of values) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      if (rec[codeProp] === kgbValIdx) {
        const decoded: Record<string, unknown> = {};
        for (const [keyName, keyIdx] of keyIndices) {
          const ref = rec[`_${keyIdx}`];
          let val: unknown;
          if (typeof ref === "number") {
            if (Number.isInteger(ref) && ref >= 0) {
              if (ref >= values.length) {
                throw new Error("btmh: ref index out of bounds for KGB record");
              }
              val = values[ref];
            } else if (Number.isInteger(ref) && ref < 0) {
              val = null;
            } else {
              val = ref;
            }
          } else if (ref === null || ref === undefined) {
            val = null;
          } else {
            val = ref;
          }

          if (
            val !== null &&
            typeof val !== "string" &&
            typeof val !== "number" &&
            typeof val !== "boolean"
          ) {
            throw new Error(`btmh: non-scalar value for key '${keyName}'`);
          }
          decoded[keyName] = val;
        }
        kgbRecords.push(decoded);
      }
    }
  }

  if (kgbRecords.length === 0) throw new Error("btmh: no KGB record found");

  const first = kgbRecords[0];
  for (let i = 1; i < kgbRecords.length; i++) {
    const r = kgbRecords[i];
    for (const k of WHITELIST_KEYS) {
      if (r[k] !== first[k]) {
        throw new Error(`btmh: conflicting KGB records in stream (field '${k}')`);
      }
    }
  }

  if (first.name !== "Kim Gia Bảo 24K") {
    throw new Error(`btmh: unexpected product name '${first.name}'`);
  }
  if (first.hl_vang !== "99.99") {
    throw new Error(`btmh: unexpected purity '${first.hl_vang}'`);
  }
  if (first.unit !== "VND/1 chỉ") {
    throw new Error(`btmh: unexpected unit '${first.unit}'`);
  }
  if (first.weight !== "1 chỉ") {
    throw new Error(`btmh: unexpected weight '${first.weight}'`);
  }

  const rawBuy = parseStrictInt(first.buy_price);
  const rawSell = parseStrictInt(first.sell_price);
  if (rawBuy === null || rawSell === null) {
    throw new Error("btmh: missing or invalid buy_price/sell_price");
  }

  const quote: RingQuote = {
    buy: rawBuy * 10,
    sell: rawSell * 10,
    product: "Kim Gia Bảo 24K",
    source: BTMH_HTML_URL,
    publishedAt: parseBtmhPublishedAt(first.last_updated),
    fetchedAt,
  };

  if (!validRingQuote(quote)) {
    throw new Error("btmh: generated quote failed validRingQuote");
  }
  return quote;
}

async function fetchWithRetry(url: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 403) throw new Error(`HTTP 403 for ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err: unknown) {
      lastErr = err;
      if (String((err as Error)?.message ?? err).includes("403")) break;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

export async function fetchRingQuotes(): Promise<{
  quotes: Partial<Record<RingBrand, RingQuote>>;
  errors: Partial<Record<RingBrand, string>>;
}> {
  const quotes: Partial<Record<RingBrand, RingQuote>> = {};
  const errors: Partial<Record<RingBrand, string>> = {};

  const fetchBtmc = async (): Promise<RingQuote> => {
    const apiText = await fetchWithRetry(BTMC_API_URL);
    const fetchedAt = new Date().toISOString();
    return parseBtmcRingApi(apiText, fetchedAt);
  };

  const fetchBtmh = async (): Promise<RingQuote> => {
    const htmlText = await fetchWithRetry(BTMH_HTML_URL);
    const fetchedAt = new Date().toISOString();
    return parseBtmhRingHtml(htmlText, fetchedAt);
  };

  const [btmcResult, btmhResult] = await Promise.allSettled([
    fetchBtmc(),
    fetchBtmh(),
  ]);

  if (btmcResult.status === "fulfilled") {
    quotes.btmc = btmcResult.value;
  } else {
    errors.btmc =
      (btmcResult.reason as Error)?.message ?? String(btmcResult.reason);
  }

  if (btmhResult.status === "fulfilled") {
    quotes.btmh = btmhResult.value;
  } else {
    errors.btmh =
      (btmhResult.reason as Error)?.message ?? String(btmhResult.reason);
  }

  return { quotes, errors };
}

export async function collectRingGold(filePath: string): Promise<{
  collected: number;
  changed: boolean;
  errors: Partial<Record<RingBrand, string>>;
}> {
  let existingHistory: RingGoldDay[] = [];
  let fileExists = false;

  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    fileExists = true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Corrupt JSON in ring gold history at ${filePath}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid ring gold history at ${filePath}: expected array`);
    }

    const seenDates = new Set<string>();
    for (const row of parsed) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`Invalid row in ${filePath}: not an object`);
      }
      if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
        throw new Error(`Invalid date in row of ${filePath}: ${row.date}`);
      }
      const d = new Date(row.date + "T00:00:00Z");
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== row.date) {
        throw new Error(`Invalid calendar date in row of ${filePath}: ${row.date}`);
      }
      if (seenDates.has(row.date)) {
        throw new Error(`Duplicate date in ${filePath}: ${row.date}`);
      }
      seenDates.add(row.date);

      if (
        !row.quotes ||
        typeof row.quotes !== "object" ||
        Array.isArray(row.quotes)
      ) {
        throw new Error(`Invalid quotes object in row of ${filePath}`);
      }
      const brandKeys = Object.keys(row.quotes);
      if (brandKeys.length === 0) {
        throw new Error(`Empty quotes in row for date ${row.date} of ${filePath}`);
      }
      for (const k of brandKeys) {
        if (k !== "btmc" && k !== "btmh") {
          throw new Error(`Unknown brand key '${k}' in ${filePath}`);
        }
        const q = row.quotes[k];
        if (!validRingQuote(q)) {
          throw new Error(`Invalid quote for brand '${k}' in ${filePath}`);
        }
        const quoteVn = toVnDateString(Date.parse(q.fetchedAt));
        if (quoteVn !== row.date) {
          throw new Error(
            `Quote fetchedAt VN date '${quoteVn}' does not match row date '${row.date}'`
          );
        }
      }
    }

    existingHistory = parsed as RingGoldDay[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      existingHistory = [];
    } else {
      throw err;
    }
  }

  const { quotes, errors } = await fetchRingQuotes();
  const collected = Object.keys(quotes).length;

  let mergedHistory = existingHistory;
  for (const brand of ["btmc", "btmh"] as const) {
    const q = quotes[brand];
    if (q) {
      mergedHistory = mergeRingQuote(mergedHistory, brand, q);
    }
  }

  const existingJson = JSON.stringify(existingHistory);
  const mergedJson = JSON.stringify(mergedHistory);
  const changed = !fileExists || mergedJson !== existingJson;

  if (changed) {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpFile = path.join(
      dir,
      `.${path.basename(filePath)}.tmp.${Date.now()}_${Math.random().toString(36).slice(2)}`
    );
    try {
      await fs.promises.writeFile(
        tmpFile,
        JSON.stringify(mergedHistory, null, 2) + "\n",
        "utf-8"
      );
      await fs.promises.rename(tmpFile, filePath);
    } catch (err) {
      try {
        await fs.promises.unlink(tmpFile);
      } catch {
        // ignore unlink error
      }
      throw err;
    }
  }

  return { collected, changed, errors };
}
