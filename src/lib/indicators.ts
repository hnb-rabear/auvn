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
