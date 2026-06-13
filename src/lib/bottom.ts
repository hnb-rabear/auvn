/** Engine xác suất đáy (Bottom Hunter). Dùng chung với scripts/bottom-study.ts. */

import { sma, rsi, macd, drawdownFromPeak, declineSpeedPct, bullishRsiDivergence } from "./indicators";
import type { BottomDriver } from "./types";

/**
 * Dán nhãn "gần đáy" cho ngày i: giá thấp nhất trong H phiên kế tiếp KHÔNG thấp
 * hơn close[i] quá eps%. Trả null nếu chưa đủ H phiên tương lai (không dán nhãn được).
 * CHỈ dùng để backtest/dán nhãn lịch sử — không bao giờ gọi trên ngày hiện tại ở live.
 */
export function labelNearBottom(
  closes: number[],
  i: number,
  horizonDays: number,
  epsPct: number
): boolean | null {
  if (i + horizonDays >= closes.length) return null;
  const floor = closes[i] * (1 - epsPct / 100);
  let minFwd = Infinity;
  for (let j = i + 1; j <= i + horizonDays; j++) {
    if (closes[j] < minFwd) minFwd = closes[j];
  }
  return minFwd >= floor;
}

const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));

export interface BottomFeatureInputs {
  /** XAU/USD đóng cửa cũ -> mới */
  closes: number[];
  /** DXY đóng cửa cũ -> mới (rỗng nếu không có) */
  dxyCloses: number[];
  /** lợi suất 10 năm đóng cửa cũ -> mới, hoặc null */
  yieldCloses: number[] | null;
  /** Fed funds theo tháng cũ -> mới */
  fedRates: number[];
}

function na(id: string, label: string): BottomDriver {
  return { id, label, score: 0, explanation: "Không có dữ liệu.", available: false };
}

/** Trả về 6 feature đáy (-2..+2). id khớp BOTTOM_CONFIG.weights. */
export function bottomFeatures(inp: BottomFeatureInputs): BottomDriver[] {
  const { closes } = inp;
  const out: BottomDriver[] = [];
  const fmt = (n: number, d = 1) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

  // dd: drawdown từ đỉnh 252 phiên. Càng sâu dưới đỉnh càng gần vùng đáy tiềm năng.
  const dd = drawdownFromPeak(closes, 252);
  if (dd === null) out.push(na("dd", "Độ sâu dưới đỉnh 1 năm"));
  else {
    const score = dd >= 20 ? 2 : dd >= 12 ? 1 : dd >= 5 ? 0 : dd >= 1 ? -1 : -2;
    out.push({
      id: "dd", label: "Độ sâu dưới đỉnh 1 năm", score,
      explanation: `Giá đang thấp hơn đỉnh 1 năm ${fmt(dd)}%: ${score > 0 ? "vùng chiết khấu sâu" : score < 0 ? "sát đỉnh, xa đáy" : "chiết khấu vừa"}.`,
      available: true,
    });
  }

  // spd: tốc độ rơi 63 phiên. Rơi mạnh -> khả năng tạo đáy nhọn cao hơn.
  const spd = declineSpeedPct(closes, 63);
  if (spd === null) out.push(na("spd", "Tốc độ rơi 3 tháng"));
  else {
    const score = spd <= -15 ? 2 : spd <= -7 ? 1 : spd < 3 ? 0 : spd < 10 ? -1 : -2;
    out.push({
      id: "spd", label: "Tốc độ rơi 3 tháng", score,
      explanation: `XAU thay đổi ${spd >= 0 ? "+" : ""}${fmt(spd)}% trong 3 tháng: ${score > 0 ? "đang rơi, vùng dò đáy" : score < 0 ? "đang tăng nóng" : "đi ngang"}.`,
      available: true,
    });
  }

  // rsi: quá bán + phân kỳ tăng.
  const r = rsi(closes, 14);
  if (r === null) out.push(na("rsi", "Quá bán & phân kỳ RSI"));
  else {
    let score = r < 30 ? 2 : r < 40 ? 1 : r <= 60 ? 0 : r <= 70 ? -1 : -2;
    const div = bullishRsiDivergence(closes);
    if (div && score < 2) score += 1; // phân kỳ tăng củng cố tín hiệu đáy
    out.push({
      id: "rsi", label: "Quá bán & phân kỳ RSI", score: clamp2(score),
      explanation: `RSI ngày = ${fmt(r)}${div ? ", có phân kỳ tăng" : ""}: ${score > 0 ? "đà giảm cạn dần" : score < 0 ? "còn mạnh, chưa đáy" : "trung tính"}.`,
      available: true,
    });
  }

  // macd: histogram cắt lên từ dưới 0 -> đảo chiều sớm.
  const m = macd(closes);
  if (m === null) out.push(na("macd", "MACD đảo chiều"));
  else {
    const score = m.histogram > 0 && m.line < 0 ? 2 : m.histogram > 0 ? 1 : m.histogram > -1 ? 0 : -1;
    out.push({
      id: "macd", label: "MACD đảo chiều", score: clamp2(score),
      explanation: `MACD histogram ${m.histogram >= 0 ? "+" : ""}${fmt(m.histogram, 2)}: ${score > 0 ? "động lượng đang đảo lên" : "chưa có dấu đảo chiều"}.`,
      available: true,
    });
  }

  // macro: USD yếu + lợi suất rơi + Fed nới -> môi trường đáy chu kỳ vàng.
  if (inp.dxyCloses.length < 51) out.push(na("macro", "Vĩ mô đảo chiều"));
  else {
    const dxyLast = inp.dxyCloses[inp.dxyCloses.length - 1];
    const dxyMa50 = sma(inp.dxyCloses, 50)!;
    let s = dxyLast < dxyMa50 ? 1 : -1;
    const parts = [`USD ${dxyLast < dxyMa50 ? "dưới" : "trên"} MA50`];
    if (inp.yieldCloses && inp.yieldCloses.length >= 64) {
      const yc = inp.yieldCloses;
      const dy = yc[yc.length - 1] - yc[yc.length - 64];
      s += dy <= -0.2 ? 1 : dy >= 0.2 ? -1 : 0;
      parts.push(`lợi suất ${dy >= 0 ? "+" : ""}${fmt(dy, 2)}đ/3 tháng`);
    }
    if (inp.fedRates.length >= 4) {
      const df = inp.fedRates[inp.fedRates.length - 1] - inp.fedRates[inp.fedRates.length - 4];
      s += df < 0 ? 1 : df > 0 ? -1 : 0;
      parts.push(`Fed ${df >= 0 ? "+" : ""}${fmt(df, 2)}đ`);
    }
    const score = clamp2(s);
    out.push({
      id: "macro", label: "Vĩ mô đảo chiều", score,
      explanation: `${parts.join(", ")}: ${score > 0 ? "môi trường thuận đáy chu kỳ vàng" : score < 0 ? "vĩ mô bất lợi" : "trung tính"}.`,
      available: true,
    });
  }

  // mom: động lượng 12 tháng (trend). Âm sâu -> bear, cẩn trọng bắt đáy.
  if (closes.length < 253) out.push(na("mom", "Động lượng 12 tháng"));
  else {
    const mom = (closes[closes.length - 1] / closes[closes.length - 253] - 1) * 100;
    const score = mom > 20 ? -1 : mom > 0 ? 0 : mom > -15 ? 1 : 2;
    out.push({
      id: "mom", label: "Động lượng 12 tháng", score: clamp2(score),
      explanation: `XAU ${mom >= 0 ? "+" : ""}${fmt(mom)}% so với 12 tháng trước: ${mom < 0 ? "đã giảm dài, gần vùng kiệt" : "đang trên cao, ít khả năng đáy lớn"}.`,
      available: true,
    });
  }

  return out;
}
