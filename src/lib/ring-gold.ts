export type RingBrand = "btmc" | "btmh";

export interface RingQuote {
  buy: number;
  sell: number;
  product: string;
  source: string; // URL cố định từ collector; không nhận URL tùy ý từ response
  publishedAt: string | null; // ISO có timezone; nguồn không cho giờ thì null
  fetchedAt: string; // ISO UTC
}

export interface RingGoldDay {
  date: string; // ngày VN của publishedAt; nếu không rõ dùng ngày quan sát
  quotes: Partial<Record<RingBrand, RingQuote>>;
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-]\d{2}:\d{2}|Z)$/;

function parseIsoCalendar(str: string): { ms: number; tz: string } | null {
  if (typeof str !== "string") return null;
  const m = ISO_RE.exec(str);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const tz = m[8];

  if (month < 1 || month > 12) return null;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  if (tz !== "Z") {
    const tzH = Number(tz.slice(1, 3));
    const tzM = Number(tz.slice(4, 6));
    if (tzH < 0 || tzH > 23 || tzM < 0 || tzM > 59) return null;
  }

  const ms = Date.parse(str);
  if (Number.isNaN(ms)) return null;

  return { ms, tz };
}

function toVnDateString(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

export function ringBrand(value: unknown): RingBrand {
  return value === "btmh" ? "btmh" : "btmc";
}

export function validRingQuote(value: unknown): value is RingQuote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const q = value as Partial<RingQuote>;

  // Finite prices within 50M - 600M VND/lượng band
  if (
    typeof q.buy !== "number" ||
    typeof q.sell !== "number" ||
    !Number.isFinite(q.buy) ||
    !Number.isFinite(q.sell) ||
    q.buy < 50_000_000 ||
    q.buy > 600_000_000 ||
    q.sell < 50_000_000 ||
    q.sell > 600_000_000 ||
    q.buy > q.sell
  ) {
    return false;
  }

  if (typeof q.product !== "string" || q.product.trim().length === 0) return false;
  if (typeof q.source !== "string" || q.source.trim().length === 0) return false;

  // fetchedAt must be ISO UTC
  if (typeof q.fetchedAt !== "string") return false;
  const parsedFetched = parseIsoCalendar(q.fetchedAt);
  if (
    !parsedFetched ||
    (parsedFetched.tz !== "Z" &&
      parsedFetched.tz !== "+00:00" &&
      parsedFetched.tz !== "-00:00")
  ) {
    return false;
  }

  const fetchedVnDate = toVnDateString(parsedFetched.ms);

  // publishedAt: null or valid ISO matching fetchedAt VN date and publishedAt <= fetchedAt
  if (q.publishedAt === null) {
    return true;
  }
  if (typeof q.publishedAt !== "string") return false;
  const parsedPublished = parseIsoCalendar(q.publishedAt);
  if (
    !parsedPublished ||
    parsedPublished.ms > parsedFetched.ms ||
    toVnDateString(parsedPublished.ms) !== fetchedVnDate
  ) {
    return false;
  }

  return true;
}

export function mergeRingQuote(
  history: RingGoldDay[],
  brand: RingBrand,
  quote: RingQuote
): RingGoldDay[] {
  if (!validRingQuote(quote)) {
    return history;
  }
  const b = ringBrand(brand);

  const fetchedMs = Date.parse(quote.fetchedAt);
  const targetDate = toVnDateString(fetchedMs);

  const dayIndex = history.findIndex((d) => d.date === targetDate);

  if (dayIndex === -1) {
    const newDay: RingGoldDay = {
      date: targetDate,
      quotes: { [b]: quote },
    };
    const insertIdx = history.findIndex((d) => d.date > targetDate);
    if (insertIdx === -1) {
      return [...history, newDay];
    }
    return [...history.slice(0, insertIdx), newDay, ...history.slice(insertIdx)];
  }

  const existingDay = history[dayIndex];
  const existingQuote = existingDay.quotes[b];

  if (existingQuote) {
    if (quote.buy === existingQuote.buy && quote.sell === existingQuote.sell) return history;
    if (quote.publishedAt !== null && existingQuote.publishedAt !== null) {
      const newPub = Date.parse(quote.publishedAt);
      const oldPub = Date.parse(existingQuote.publishedAt);
      if (newPub < oldPub) return history;
      if (
        newPub === oldPub &&
        quote.buy === existingQuote.buy &&
        quote.sell === existingQuote.sell
      ) {
        return history;
      }
    } else {
      const newFetch = Date.parse(quote.fetchedAt);
      const oldFetch = Date.parse(existingQuote.fetchedAt);
      if (newFetch < oldFetch) return history;
      if (
        (newFetch === oldFetch ||
          (quote.publishedAt === null && existingQuote.publishedAt === null)) &&
        quote.buy === existingQuote.buy &&
        quote.sell === existingQuote.sell
      ) {
        return history;
      }
    }
  }

  const updatedDay: RingGoldDay = {
    ...existingDay,
    quotes: {
      ...existingDay.quotes,
      [b]: quote,
    },
  };
  const next = [...history];
  next[dayIndex] = updatedDay;
  return next;
}

export function ringQuoteAt(
  history: RingGoldDay[],
  brand: RingBrand,
  date: string,
  exact: boolean
): RingQuote | null {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return null;
  }
  const b = ringBrand(brand);

  if (exact) {
    const day = history.find((d) => d.date === date);
    return day?.quotes[b] ?? null;
  }

  let latest: { date: string; quote: RingQuote } | null = null;
  for (const day of history) {
    if (day.date <= date) {
      const q = day.quotes[b];
      if (q && (!latest || day.date > latest.date)) {
        latest = { date: day.date, quote: q };
      }
    }
  }

  return latest ? latest.quote : null;
}
