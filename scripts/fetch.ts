/** Fetchers cho cron. Mỗi nguồn có fallback; lỗi trả null thay vì throw. */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function get(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export interface DailyBar {
  date: string;
  close: number;
}

function parseStooqCsv(csv: string): DailyBar[] {
  const lines = csv.trim().split("\n");
  const out: DailyBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const close = parseFloat(c[4]);
    if (c[0] && Number.isFinite(close)) out.push({ date: c[0], close });
  }
  return out;
}

async function fetchStooq(symbol: string): Promise<DailyBar[]> {
  const csv = await get(`https://stooq.com/q/d/l/?s=${symbol}&i=d`);
  const bars = parseStooqCsv(csv);
  if (bars.length < 500) throw new Error(`stooq ${symbol}: only ${bars.length} rows`);
  return bars;
}

async function fetchYahoo(symbol: string): Promise<{ bars: DailyBar[]; lastTs: number | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=20y&interval=1d`;
  const json = JSON.parse(await get(url));
  const r = json?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyBar[] = [];
  let lastTs: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) {
      out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      lastTs = ts[i]; // epoch (giây) của bar hợp lệ cuối
    }
  }
  if (out.length < 500) throw new Error(`yahoo ${symbol}: only ${out.length} rows`);
  return { bars: out, lastTs };
}

export async function fetchXau(): Promise<{ bars: DailyBar[]; source: string; lastTs: number | null }> {
  try {
    const y = await fetchYahoo("GC=F");
    return { bars: y.bars, source: "yahoo:GC=F", lastTs: y.lastTs };
  } catch {
    return { bars: await fetchStooq("xauusd"), source: "stooq:xauusd", lastTs: null };
  }
}

export async function fetchDxy(): Promise<{ bars: DailyBar[]; source: string; lastTs: number | null } | null> {
  try {
    const y = await fetchYahoo("DX-Y.NYB");
    return { bars: y.bars, source: "yahoo:DX-Y.NYB", lastTs: y.lastTs };
  } catch {
    for (const s of ["dx.f", "^dxy", "usdidx"]) {
      try {
        return { bars: await fetchStooq(s), source: `stooq:${s}`, lastTs: null };
      } catch {
        /* thử symbol kế tiếp */
      }
    }
    return null;
  }
}

/** Chuỗi FRED bất kỳ qua CSV công khai (không cần key). */
async function fetchFredSeries(id: string, minRows: number): Promise<DailyBar[] | null> {
  try {
    const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, 60000);
    const lines = csv.trim().split("\n");
    const out: DailyBar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [d, raw] = lines[i].split(",");
      const v = parseFloat(raw);
      if (d && Number.isFinite(v)) out.push({ date: d, close: v });
    }
    return out.length >= minRows ? out : null;
  } catch {
    return null;
  }
}

/** Fed funds rate theo tháng. */
export async function fetchFedFunds(): Promise<{ date: string; value: number }[] | null> {
  const bars = await fetchFredSeries("FEDFUNDS", 12);
  return bars ? bars.map((b) => ({ date: b.date, value: b.close })) : null;
}

/**
 * Lợi suất trái phiếu Mỹ 10 năm — CHỈ thử ^TNX (danh nghĩa), không tự tráo
 * sang FRED DFII10 (lợi suất thực) bên trong hàm này nữa: real và nominal là
 * hai chuỗi khác bản chất (mức và xu hướng khác nhau ở cùng một ngày), nên nếu
 * hàm này tự âm thầm đổi nguồn mỗi khi Yahoo chập chờn, TOÀN BỘ lịch sử macro
 * criterion (backtest + bottom) tính lại mỗi cron sẽ cho một ngày QUÁ KHỨ đã
 * cố định điểm số khác nhau giữa các lần chạy — vỡ tính "kiểm chứng được" của
 * backtest. run.ts giờ tự quyết định thứ tự dự phòng (cache nominal đã lưu
 * trước, DFII10 chỉ dùng khi cold-start không có cache) — xem loadYieldCache.
 */
export async function fetchYield10y(): Promise<{ bars: DailyBar[]; real: boolean; source: string; lastTs: number | null } | null> {
  try {
    const y = await fetchYahoo("^TNX");
    return { bars: y.bars, real: false, source: "yahoo:^TNX", lastTs: y.lastTs };
  } catch {
    return null;
  }
}

export async function fetchVix(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const y = await fetchYahoo("^VIX");
    return { bars: y.bars, source: "yahoo:^VIX" };
  } catch {
    return null;
  }
}

export async function fetchSilver(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const y = await fetchYahoo("SI=F");
    return { bars: y.bars, source: "yahoo:SI=F" };
  } catch {
    return null;
  }
}

/** Lợi suất thực 10 năm (TIPS) — FRED DFII10. Free, từ ~2003. */
export async function fetchRealYield(): Promise<{ bars: DailyBar[]; source: string } | null> {
  const bars = await fetchFredSeries("DFII10", 500);
  return bars ? { bars, source: "fred:DFII10" } : null;
}

/** Kỳ vọng lạm phát hòa vốn 10 năm — FRED T10YIE. Free, từ 2003. */
export async function fetchBreakeven(): Promise<{ bars: DailyBar[]; source: string } | null> {
  const bars = await fetchFredSeries("T10YIE", 500);
  return bars ? { bars, source: "fred:T10YIE" } : null;
}

/** Cung tiền M2 (tuần, chưa điều chỉnh mùa vụ) — FRED WM2NS. Free, từ 1981. */
export async function fetchM2(): Promise<{ bars: DailyBar[]; source: string } | null> {
  const bars = await fetchFredSeries("WM2NS", 100);
  return bars ? { bars, source: "fred:WM2NS" } : null;
}

/** Dầu WTI — Yahoo CL=F. */
export async function fetchWti(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const y = await fetchYahoo("CL=F");
    return { bars: y.bars, source: "yahoo:CL=F" };
  } catch {
    return null;
  }
}

/** Geopolitical Risk Index (Caldara & Iacoviello) — file XLS hàng ngày. */
export async function fetchGpr(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const XLSX = await import("xlsx");
    const res = await fetch(
      "https://www.matteoiacoviello.com/gpr_files/data_gpr_daily_recent.xls",
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
    const dateKey = Object.keys(rows[0] ?? {}).find((k) => /date|day/i.test(k));
    const valKey = Object.keys(rows[0] ?? {}).find((k) => /^GPRD$/i.test(k));
    if (!dateKey || !valKey) throw new Error(`gpr: columns not found (${Object.keys(rows[0] ?? {}).join(",")})`);
    const out: DailyBar[] = [];
    for (const r of rows) {
      const v = Number(r[valKey]);
      const raw = String(r[dateKey]);
      let d: string;
      if (/^\d{8}$/.test(raw)) {
        d = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      } else if (/^\d+$/.test(raw)) {
        // serial date của Excel
        d = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10);
      } else {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) continue;
        d = parsed.toISOString().slice(0, 10);
      }
      if (Number.isFinite(v)) out.push({ date: d, close: v });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return out.length > 500 ? { bars: out, source: "gpr:daily" } : null;
  } catch {
    return null;
  }
}

export interface VnGoldQuote {
  sjcBuy: number | null;
  sjcSell: number | null;
  ringBuy: number | null;
  ringSell: number | null;
  source: string;
}

/**
 * Chuẩn hóa về VND/lượng. Nguồn VN báo giá lung tung: đồng/lượng, đồng/chỉ (BTMC),
 * nghìn đồng/lượng (SJC XML cũ) — thử các hệ số, chọn giá trị rơi vào khoảng hợp lý.
 */
function normalizeVnd(v: number): number | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  for (const f of [1, 10, 1000, 10000]) {
    const x = v * f;
    if (x >= 50_000_000 && x <= 600_000_000) return x;
  }
  return null;
}

function pickSjcFromJson(data: unknown[]): VnGoldQuote {
  const q: VnGoldQuote = { sjcBuy: null, sjcSell: null, ringBuy: null, ringSell: null, source: "sjc:json" };
  for (const row of data as Record<string, unknown>[]) {
    const name = String(row.TypeName ?? row.typeName ?? "").toLowerCase();
    const branch = String(row.BranchName ?? row.branchName ?? "").toLowerCase();
    const buy = normalizeVnd(parseFloat(String(row.BuyValue ?? row.buyValue ?? row.Buy ?? "").replace(/[,.]/g, "")));
    const sell = normalizeVnd(parseFloat(String(row.SellValue ?? row.sellValue ?? row.Sell ?? "").replace(/[,.]/g, "")));
    if (branch && !branch.includes("hồ chí minh") && !branch.includes("ho chi minh")) continue;
    if (q.sjcBuy === null && name.includes("sjc") && (name.includes("1l") || name.includes("miếng"))) {
      q.sjcBuy = buy;
      q.sjcSell = sell;
    }
    if (q.ringBuy === null && (name.includes("nhẫn") || name.includes("nhan"))) {
      q.ringBuy = buy;
      q.ringSell = sell;
    }
  }
  return q;
}

async function fetchSjc(): Promise<VnGoldQuote> {
  // Nguồn 1: JSON service của sjc.com.vn
  try {
    const txt = await get("https://sjc.com.vn/GoldPrice/Services/PriceService.ashx");
    const json = JSON.parse(txt);
    const rows = json?.data ?? json?.Data;
    if (Array.isArray(rows) && rows.length) {
      const q = pickSjcFromJson(rows);
      if (q.sjcSell) return q;
    }
  } catch {
    /* sang nguồn kế */
  }
  // Nguồn 2: XML cũ
  const xml = await get("https://sjc.com.vn/xml/tygiavang.xml");
  const q: VnGoldQuote = { sjcBuy: null, sjcSell: null, ringBuy: null, ringSell: null, source: "sjc:xml" };
  const items = xml.match(/<item[^>]*\/>/g) ?? [];
  for (const it of items) {
    const attr = (n: string) => {
      const m = it.match(new RegExp(`${n}="([^"]*)"`, "i"));
      return m ? m[1] : "";
    };
    const type = attr("type").toLowerCase();
    const buy = normalizeVnd(parseFloat(attr("buy").replace(/,/g, "")));
    const sell = normalizeVnd(parseFloat(attr("sell").replace(/,/g, "")));
    if (q.sjcBuy === null && type.includes("sjc")) {
      q.sjcBuy = buy;
      q.sjcSell = sell;
    }
    if (q.ringBuy === null && (type.includes("nhẫn") || type.includes("nhan"))) {
      q.ringBuy = buy;
      q.ringSell = sell;
    }
  }
  if (!q.sjcSell) throw new Error("sjc: no usable rows");
  return q;
}

async function fetchBtmc(): Promise<VnGoldQuote> {
  const txt = await get(
    "http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v"
  );
  const json = JSON.parse(txt);
  const rows: Record<string, string>[] = json?.DataList?.Data ?? [];
  const q: VnGoldQuote = { sjcBuy: null, sjcSell: null, ringBuy: null, ringSell: null, source: "btmc" };
  for (const row of rows) {
    // mỗi row có hậu tố chỉ số: @n_1, @pb_1, @ps_1, ...
    const idx = Object.keys(row)
      .find((k) => k.startsWith("@n_"))
      ?.slice(3);
    if (!idx) continue;
    const name = String(row[`@n_${idx}`] ?? "").toLowerCase();
    const buy = normalizeVnd(parseFloat(String(row[`@pb_${idx}`] ?? "")));
    const sell = normalizeVnd(parseFloat(String(row[`@ps_${idx}`] ?? "")));
    if (q.sjcBuy === null && name.includes("sjc")) {
      q.sjcBuy = buy;
      q.sjcSell = sell;
    }
    if (q.ringBuy === null && (name.includes("nhẫn") || name.includes("nhan tron"))) {
      q.ringBuy = buy;
      q.ringSell = sell;
    }
  }
  if (!q.sjcSell && !q.ringSell) throw new Error("btmc: no usable rows");
  return q;
}

/** BTMC trước (ổn định, không chặn bot); SJC sau (đang bị Cloudflare challenge). */
export async function fetchVnGold(): Promise<VnGoldQuote | null> {
  try {
    return await fetchBtmc();
  } catch {
    try {
      return await fetchSjc();
    } catch {
      return null;
    }
  }
}

export async function fetchUsdVnd(): Promise<{ value: number; source: string } | null> {
  try {
    const xml = await get(
      "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10"
    );
    const m = xml.match(/CurrencyCode="USD"[^/]*Sell="([\d.,]+)"/i);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ""));
      if (v > 10000 && v < 60000) return { value: v, source: "vietcombank" };
    }
    throw new Error("vcb: USD row not found");
  } catch {
    try {
      const json = JSON.parse(await get("https://open.er-api.com/v6/latest/USD"));
      const v = json?.rates?.VND;
      if (typeof v === "number" && v > 10000 && v < 60000)
        return { value: v, source: "er-api" };
      return null;
    } catch {
      return null;
    }
  }
}
