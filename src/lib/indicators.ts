/** Chỉ báo kỹ thuật thuần hàm trên mảng giá đóng cửa (cũ -> mới). */

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

/** RSI Wilder. Trả về RSI tại điểm cuối, null nếu thiếu dữ liệu. */
export function rsi(values: number[], n = 14): number | null {
  if (values.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Vị trí percentile (0..100) của giá trị cuối trong cửa sổ `window` phần tử cuối. */
export function percentileRank(values: number[], window: number): number | null {
  if (values.length < 2) return null;
  const w = values.slice(-Math.min(window, values.length));
  const last = w[w.length - 1];
  let below = 0;
  for (const v of w) if (v < last) below++;
  return (below / (w.length - 1)) * 100;
}

/** Độ biến động 30 ngày (độ lệch chuẩn lợi suất ngày, annualized %). */
export function volatility30(values: number[]): number | null {
  if (values.length < 31) return null;
  const w = values.slice(-31);
  const rets: number[] = [];
  for (let i = 1; i < w.length; i++) rets.push(Math.log(w[i] / w[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

/** Gom giá ngày thành giá tuần (mỗi 5 phiên lấy phiên cuối). */
export function toWeekly(values: number[]): number[] {
  const out: number[] = [];
  for (let i = values.length - 1; i >= 0; i -= 5) out.push(values[i]);
  return out.reverse();
}

export interface SwingLevels {
  support: number | null;
  resistance: number | null;
}

/** Hỗ trợ/kháng cự từ swing high/low cửa sổ `window` phiên cuối, đỉnh/đáy cục bộ bán kính k. */
export function swingLevels(values: number[], window = 126, k = 5): SwingLevels {
  const w = values.slice(-window);
  const last = w[w.length - 1];
  let support: number | null = null;
  let resistance: number | null = null;
  for (let i = k; i < w.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (w[j] > w[i]) isHigh = false;
      if (w[j] < w[i]) isLow = false;
    }
    if (isLow && w[i] < last && (support === null || w[i] > support)) support = w[i];
    if (isHigh && w[i] > last && (resistance === null || w[i] < resistance)) resistance = w[i];
  }
  return { support, resistance };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** EMA tại điểm cuối (cũ -> mới). null nếu thiếu dữ liệu. */
function ema(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export interface Macd {
  line: number;
  signal: number;
  histogram: number;
}

/** MACD(12,26,9) tại điểm cuối. null nếu < 35 phiên. */
export function macd(values: number[], fast = 12, slow = 26, sig = 9): Macd | null {
  if (values.length < slow + sig) return null;
  const lineSeries: number[] = [];
  for (let i = slow; i <= values.length; i++) {
    const sub = values.slice(0, i);
    const f = ema(sub, fast);
    const s = ema(sub, slow);
    if (f === null || s === null) continue;
    lineSeries.push(f - s);
  }
  const line = lineSeries[lineSeries.length - 1];
  const signal = ema(lineSeries, sig);
  if (signal === null) return null;
  return { line, signal, histogram: line - signal };
}

/** % giá hiện tại dưới đỉnh trailing `window` phiên (dương = đang dưới đỉnh). */
export function drawdownFromPeak(values: number[], window: number): number | null {
  if (values.length < 2) return null;
  const w = values.slice(-Math.min(window, values.length));
  const peak = Math.max(...w);
  const last = w[w.length - 1];
  return peak === 0 ? null : ((peak - last) / peak) * 100;
}

/** Lợi suất % trên `lookback` phiên gần nhất (âm = đang rơi). */
export function declineSpeedPct(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 1 - lookback];
  return prev === 0 ? null : ((last - prev) / prev) * 100;
}

/**
 * Phân kỳ RSI tăng: trong `window` phiên cuối, đáy giá GẦN ĐÂY thấp hơn đáy giá
 * TRƯỚC ĐÓ nhưng RSI tại đáy gần đây CAO hơn — dấu hiệu đà giảm cạn. Xấp xỉ bằng
 * cách so hai nửa cửa sổ: min giá + RSI tại điểm min.
 */
export function bullishRsiDivergence(values: number[], window = 60): boolean {
  if (values.length < window + 14) return false;
  const w = values.slice(-window);
  const mid = Math.floor(w.length / 2);
  const idxMin = (arr: number[], from: number, to: number) => {
    let mi = from;
    for (let i = from; i < to; i++) if (arr[i] < arr[mi]) mi = i;
    return mi;
  };
  const prevLowIdx = idxMin(w, 0, mid);
  const recentLowIdx = idxMin(w, mid, w.length);
  if (w[recentLowIdx] >= w[prevLowIdx]) return false; // giá không tạo đáy thấp hơn
  const offset = values.length - window;
  const rsiAt = (localIdx: number): number | null =>
    rsi(values.slice(0, offset + localIdx + 1), 14);
  const rPrev = rsiAt(prevLowIdx);
  const rRecent = rsiAt(recentLowIdx);
  if (rPrev === null || rRecent === null) return false;
  return rRecent > rPrev; // RSI đáy gần đây cao hơn -> phân kỳ tăng
}

/** RNG có seed (mulberry32) để bootstrap tái lập được. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Block bootstrap CI 95% cho tỉ lệ thuận chiều. Tín hiệu bắn chùm (cách STEP
 * phiên, kỳ hạn chồng lấn) nên resample theo KHỐI liên tiếp thay vì từng điểm —
 * không tôn trọng autocorrelation thì CI hẹp ảo.
 */
export function blockBootstrapCi(
  returns: number[],
  blockSize: number,
  iterations = 2000,
  seed = 20260611
): [number, number] | null {
  const n = returns.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const favs: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let fav = 0;
    let total = 0;
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && total < n; j++) {
        if (returns[(start + j) % n] > 0) fav++;
        total++;
      }
    }
    favs.push(fav / total);
  }
  favs.sort((a, c) => a - c);
  const lo = favs[Math.floor(0.025 * (iterations - 1))];
  const hi = favs[Math.floor(0.975 * (iterations - 1))];
  return [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10];
}

/**
 * Bản CÓ TRỌNG SỐ của blockBootstrapCi: CI 95% cho tỉ lệ thuận chiều khi mỗi quan sát
 * mang trọng số (recency). Resample theo khối như bản thường, nhưng tử/mẫu là tổng
 * trọng số — CI phải tính CÙNG scheme với point estimate (bài học reliability patch
 * Bear Downside: pUp từng nằm NGOÀI CI unweighted của chính nó). Cùng seed/iterations
 * mặc định với blockBootstrapCi để walk-forward giữ bất biến "điểm cuối == live".
 */
export function weightedBlockBootstrapCi(
  returns: number[],
  weights: number[],
  blockSize: number,
  iterations = 2000,
  seed = 20260611
): [number, number] | null {
  const n = returns.length;
  if (n < 10 || weights.length !== n) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const favs: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let fav = 0;
    let tw = 0;
    let total = 0;
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && total < n; j++) {
        const idx = (start + j) % n;
        if (returns[idx] > 0) fav += weights[idx];
        tw += weights[idx];
        total++;
      }
    }
    if (tw > 0) favs.push(fav / tw);
  }
  if (favs.length < iterations * 0.5) return null;
  favs.sort((a, c) => a - c);
  const lo = favs[Math.floor(0.025 * (favs.length - 1))];
  const hi = favs[Math.floor(0.975 * (favs.length - 1))];
  return [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10];
}

/** Bollinger %B(n,k): (P − dải dưới)/(dải trên − dải dưới). null nếu < n. Có thể ra ngoài [0,1]. */
export function bollingerPercentB(values: number[], n = 20, k = 2): number | null {
  if (values.length < n) return null;
  const w = values.slice(-n);
  const mean = w.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd === 0) return 0.5;
  const lower = mean - k * sd;
  const upper = mean + k * sd;
  return (values[values.length - 1] - lower) / (upper - lower);
}

/** Stochastic %K(n) trên close (close-only): (P − min_n)/(max_n − min_n)×100. null nếu < n. */
export function stochasticK(values: number[], n = 14): number | null {
  if (values.length < n) return null;
  const w = values.slice(-n);
  const lo = Math.min(...w);
  const hi = Math.max(...w);
  if (hi === lo) return 50;
  return ((values[values.length - 1] - lo) / (hi - lo)) * 100;
}

/** Bách phân vị q∈[0,1] với nội suy tuyến tính. NaN nếu rỗng. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = q * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Block bootstrap CI 95% cho bách phân vị q. Resample theo KHỐI liên tiếp (tôn
 * trọng autocorrelation — chuỗi mức-rơi-thêm cách STEP phiên vẫn chồng lấn cửa sổ).
 * null nếu n<10. Trả [lo, hi] làm tròn 0.1.
 */
export function blockBootstrapPercentileCi(
  values: number[],
  q: number,
  blockSize: number,
  iterations = 2000,
  seed = 20260629
): [number, number] | null {
  const n = values.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const ests: number[] = [];
  for (let it = 0; it < iterations; it++) {
    const sample: number[] = [];
    for (let k = 0; k < nBlocks && sample.length < n; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && sample.length < n; j++) sample.push(values[(start + j) % n]);
    }
    ests.push(percentile(sample, q));
  }
  ests.sort((a, c) => a - c);
  const lo = ests[Math.floor(0.025 * (iterations - 1))];
  const hi = ests[Math.floor(0.975 * (iterations - 1))];
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}

/** CI 95% cho TRUNG BÌNH chuỗi chênh-lệch ghép-cặp, resample khối liên tiếp. null nếu n<10. */
export function pairedBlockBootstrapCi(
  deltas: number[],
  blockSize: number,
  iterations = 2000,
  seed = 20260630
): [number, number] | null {
  const n = deltas.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const means: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < nBlocks && cnt < n; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && cnt < n; j++) { sum += deltas[(start + j) % n]; cnt++; }
    }
    means.push(sum / cnt);
  }
  means.sort((a, c) => a - c);
  const lo = means[Math.floor(0.025 * (iterations - 1))];
  const hi = means[Math.floor(0.975 * (iterations - 1))];
  return [Math.round(lo * 10000) / 10000, Math.round(hi * 10000) / 10000];
}
