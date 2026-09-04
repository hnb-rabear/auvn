import {
  sma,
  rsi,
  percentileRank,
  volatility30,
  toWeekly,
  swingLevels,
} from "./indicators";
import type { CriterionResult, SubSignal } from "./types";
import { CRITERION_LABELS } from "./types";

const fmt = (n: number, digits = 1) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: digits });

function unavailable(id: string, label: string): SubSignal {
  return { id, label, score: 0, explanation: "Không có dữ liệu.", available: false };
}

function finish(
  key: CriterionResult["key"],
  signals: SubSignal[],
  provisional?: boolean
): CriterionResult {
  const avail = signals.filter((s) => s.available);
  const score = avail.length
    ? avail.reduce((a, s) => a + s.score, 0) / avail.length
    : 0;
  return {
    key,
    label: CRITERION_LABELS[key],
    signals,
    score: Math.max(-2, Math.min(2, score)),
    available: avail.length > 0,
    ...(provisional !== undefined ? { provisional } : {}),
  };
}

function rsiScore(v: number): number {
  if (v < 30) return 2;
  if (v < 40) return 1;
  if (v <= 60) return 0;
  if (v <= 70) return -1;
  return -2;
}

function rsiText(v: number): string {
  if (v < 30) return "quá bán — vùng mua hiếm gặp";
  if (v < 40) return "yếu — nghiêng về mua";
  if (v <= 60) return "trung tính";
  if (v <= 70) return "mạnh — nghiêng về bán";
  return "quá mua — cẩn trọng, nghiêng bán";
}

/** Tiêu chí 1: kỹ thuật XAU/USD. closes: giá ngày cũ -> mới. */
export function technicalCriterion(closes: number[]): CriterionResult {
  const signals: SubSignal[] = [];
  const last = closes[closes.length - 1];

  const rsiD = rsi(closes, 14);
  signals.push(
    rsiD === null
      ? unavailable("rsi-d", "RSI(14) khung ngày")
      : {
          id: "rsi-d",
          label: "RSI(14) khung ngày",
          score: rsiScore(rsiD),
          explanation: `RSI ngày = ${fmt(rsiD)}: ${rsiText(rsiD)}.`,
          available: true,
        }
  );

  const weekly = toWeekly(closes);
  const rsiW = rsi(weekly, 14);
  signals.push(
    rsiW === null
      ? unavailable("rsi-w", "RSI(14) khung tuần")
      : {
          id: "rsi-w",
          label: "RSI(14) khung tuần",
          score: rsiScore(rsiW),
          explanation: `RSI tuần = ${fmt(rsiW)}: ${rsiText(rsiW)}.`,
          available: true,
        }
  );

  const ma200 = sma(closes, 200);
  if (ma200 === null) {
    signals.push(unavailable("ma200", "Giá so với MA200"));
  } else {
    const d = ((last - ma200) / ma200) * 100;
    let score: number;
    let text: string;
    if (d <= -5) {
      score = 2;
      text = "thấp hơn MA200 đáng kể — vùng chiết khấu sâu, thuận mua dài hạn";
    } else if (d <= 0) {
      score = 1;
      text = "dưới MA200 — giá rẻ tương đối so với xu hướng dài hạn";
    } else if (d <= 8) {
      score = 0;
      text = "trên MA200 ở mức bình thường";
    } else if (d <= 15) {
      score = -1;
      text = "căng hơn MA200 khá xa — hạn chế mua đuổi";
    } else {
      score = -2;
      text = "vượt MA200 rất xa — vùng quá nóng, nghiêng bán";
    }
    signals.push({
      id: "ma200",
      label: "Giá so với MA200",
      score,
      explanation: `Giá ${d >= 0 ? "cao" : "thấp"} hơn MA200 ${fmt(Math.abs(d))}%: ${text}.`,
      available: true,
    });
  }

  if (closes.length < 252) {
    signals.push(unavailable("pos52w", "Vị trí trong biên độ 52 tuần"));
  } else {
    const w = closes.slice(-252);
    const hi = Math.max(...w);
    const lo = Math.min(...w);
    const pos = hi === lo ? 0.5 : (last - lo) / (hi - lo);
    let score: number;
    let text: string;
    if (pos < 0.15) {
      score = 2;
      text = "sát đáy 52 tuần — vùng mua thống kê tốt";
    } else if (pos < 0.35) {
      score = 1;
      text = "vùng thấp của biên độ năm";
    } else if (pos <= 0.65) {
      score = 0;
      text = "giữa biên độ năm";
    } else if (pos <= 0.85) {
      score = -1;
      text = "vùng cao của biên độ năm";
    } else {
      score = -2;
      text = "sát đỉnh 52 tuần — thuận bán hơn mua";
    }
    signals.push({
      id: "pos52w",
      label: "Vị trí trong biên độ 52 tuần",
      score,
      explanation: `Giá ở mức ${fmt(pos * 100, 0)}% biên độ 52 tuần (đáy ${fmt(lo, 0)} — đỉnh ${fmt(hi, 0)}): ${text}.`,
      available: true,
    });
  }

  if (closes.length < 40) {
    signals.push(unavailable("sr", "Hỗ trợ / kháng cự 6 tháng"));
  } else {
    const { support, resistance } = swingLevels(closes);
    let score = 0;
    let text = "giá nằm giữa hỗ trợ và kháng cự, không có lợi thế rõ.";
    if (support !== null && (last - support) / support <= 0.015) {
      score = 1;
      text = `giá bám sát hỗ trợ ${fmt(support, 0)} — điểm vào có cơ sở kỹ thuật.`;
    } else if (resistance !== null && (resistance - last) / last <= 0.015) {
      score = -1;
      text = `giá áp sát kháng cự ${fmt(resistance, 0)} — dễ bị chặn, thuận bán.`;
    } else if (resistance === null && support !== null) {
      score = -1;
      text = "giá vượt mọi đỉnh swing 6 tháng — đang hưng phấn, cẩn trọng mua đuổi.";
    }
    signals.push({
      id: "sr",
      label: "Hỗ trợ / kháng cự 6 tháng",
      score,
      explanation: text.charAt(0).toUpperCase() + text.slice(1),
      available: true,
    });
  }

  return finish("technical", signals);
}

export interface PremiumInputs {
  premiumPct: number | null;
  /** (giá bán - giá mua)/giá bán của SJC, % */
  spreadPct: number | null;
  /** nhẫn rẻ hơn miếng bao nhiêu % (dương = nhẫn rẻ hơn) */
  ringDiscountPct: number | null;
  /** lịch sử premiumPct tự tích lũy, cũ -> mới */
  premiumHistory: number[];
}

/** Tiêu chí 2: chênh lệch VN — thế giới. */
export function premiumCriterion(inp: PremiumInputs): CriterionResult {
  const signals: SubSignal[] = [];
  const enoughHistory = inp.premiumHistory.length >= 90;

  if (inp.premiumPct === null) {
    signals.push(unavailable("premium", "Chênh SJC so với giá thế giới quy đổi"));
  } else {
    let score: number;
    let basis: string;
    if (enoughHistory) {
      const pr = percentileRank([...inp.premiumHistory, inp.premiumPct], inp.premiumHistory.length + 1) ?? 50;
      if (pr >= 80) score = -2;
      else if (pr >= 60) score = -1;
      else if (pr <= 20) score = 2;
      else if (pr <= 40) score = 1;
      else score = 0;
      basis = `ở percentile ${fmt(pr, 0)} so với lịch sử tự thu thập (${inp.premiumHistory.length} ngày)`;
    } else {
      const p = inp.premiumPct;
      if (p >= 18) score = -2;
      else if (p >= 12) score = -1;
      else if (p <= 4) score = 2;
      else if (p <= 8) score = 1;
      else score = 0;
      basis = "so với ngưỡng tham chiếu cố định (lịch sử tự thu thập chưa đủ 90 ngày)";
    }
    const direction =
      score > 0
        ? "chênh thấp — mua vàng VN ít rủi ro 'mua đắt hơn thế giới'"
        : score < 0
          ? "chênh cao bất thường — vùng bán tốt, tránh mua"
          : "chênh ở mức bình thường";
    signals.push({
      id: "premium",
      label: "Chênh SJC so với giá thế giới quy đổi",
      score,
      explanation: `Vàng SJC đắt hơn giá thế giới quy đổi ${fmt(inp.premiumPct)}%, ${basis}: ${direction}.`,
      available: true,
    });
  }

  if (inp.spreadPct === null) {
    signals.push(unavailable("spread", "Độ rộng chênh mua–bán SJC"));
  } else {
    let score: number;
    let text: string;
    if (inp.spreadPct < 1.2) {
      score = 1;
      text = "spread hẹp — thị trường ổn định, giao dịch thuận lợi";
    } else if (inp.spreadPct < 2.5) {
      score = 0;
      text = "spread bình thường";
    } else {
      score = -1;
      text = "spread giãn rộng — thị trường biến động/khan hàng, giao dịch bất lợi";
    }
    signals.push({
      id: "spread",
      label: "Độ rộng chênh mua–bán SJC",
      score,
      explanation: `Chênh mua–bán SJC = ${fmt(inp.spreadPct)}% giá bán: ${text}.`,
      available: true,
    });
  }

  if (inp.ringDiscountPct === null) {
    signals.push(unavailable("ring", "Tương quan nhẫn — miếng"));
  } else {
    let score = 0;
    let text = "nhẫn và miếng ở tương quan bình thường.";
    if (inp.ringDiscountPct > 8) {
      score = 1;
      text = `nhẫn rẻ hơn miếng ${fmt(inp.ringDiscountPct)}% — kênh nhẫn đang hấp dẫn hơn cho người mua.`;
    } else if (inp.ringDiscountPct < 0) {
      score = -1;
      text = "nhẫn đắt hơn cả miếng — nhu cầu đang sốt bất thường, cẩn trọng.";
    }
    signals.push({
      id: "ring",
      label: "Tương quan nhẫn — miếng",
      score,
      explanation: text.charAt(0).toUpperCase() + text.slice(1),
      available: true,
    });
  }

  return finish("premium", signals, !enoughHistory);
}

export interface MacroInputs {
  /** DXY giá ngày cũ -> mới */
  dxyCloses: number[];
  /** Fed funds rate theo tháng cũ -> mới */
  fedRates: number[];
  /** USD/VND tự tích lũy: [date, value] cũ -> mới */
  usdVndHistory: { date: string; value: number }[];
  /** Lợi suất trái phiếu Mỹ 10 năm (%); real=true nếu là lợi suất thực DFII10 */
  yield10y?: { closes: number[]; real: boolean };
  /** VIX đóng cửa ngày cũ -> mới */
  vixCloses?: number[];
  /** Geopolitical Risk Index (GPRD) ngày cũ -> mới */
  gprCloses?: number[];
}

/** Tiêu chí 3: vĩ mô. */
export function macroCriterion(inp: MacroInputs): CriterionResult {
  const signals: SubSignal[] = [];

  if (inp.dxyCloses.length < 51) {
    signals.push(unavailable("dxy", "Chỉ số USD (DXY)"));
  } else {
    const last = inp.dxyCloses[inp.dxyCloses.length - 1];
    const ma50 = sma(inp.dxyCloses, 50)!;
    const prev21 = inp.dxyCloses[inp.dxyCloses.length - 22];
    const chg = ((last - prev21) / prev21) * 100;
    const above = last > ma50;
    let score: number;
    let text: string;
    if (above && chg > 1) {
      score = -2;
      text = "USD mạnh và đang tăng tốc — sức ép giảm lên giá vàng";
    } else if (above) {
      score = -1;
      text = "USD trên xu hướng trung hạn — bất lợi nhẹ cho vàng";
    } else if (!above && chg < -1) {
      score = 2;
      text = "USD yếu và đang rơi — hỗ trợ mạnh cho giá vàng";
    } else {
      score = 1;
      text = "USD dưới xu hướng trung hạn — thuận lợi cho vàng";
    }
    signals.push({
      id: "dxy",
      label: "Chỉ số USD (DXY)",
      score,
      explanation: `DXY = ${fmt(last)} (${above ? "trên" : "dưới"} MA50, ${chg >= 0 ? "+" : ""}${fmt(chg)}% trong 1 tháng): ${text}.`,
      available: true,
    });
  }

  if (inp.fedRates.length < 4) {
    signals.push(unavailable("fed", "Hướng lãi suất Fed"));
  } else {
    const last = inp.fedRates[inp.fedRates.length - 1];
    const ago3m = inp.fedRates[inp.fedRates.length - 4];
    const d = last - ago3m;
    let score: number;
    let text: string;
    if (d <= -0.25) {
      score = 2;
      text = "Fed đang hạ lãi suất rõ rệt — môi trường rất thuận cho vàng";
    } else if (d < 0) {
      score = 1;
      text = "lãi suất nhích xuống — thuận lợi cho vàng";
    } else if (d === 0) {
      score = 0;
      text = "lãi suất đi ngang";
    } else if (d < 0.25) {
      score = -1;
      text = "lãi suất nhích lên — bất lợi nhẹ";
    } else {
      score = -2;
      text = "Fed đang tăng lãi suất — sức ép lớn lên giá vàng";
    }
    signals.push({
      id: "fed",
      label: "Hướng lãi suất Fed",
      score,
      explanation: `Fed funds ${fmt(last, 2)}% (3 tháng trước ${fmt(ago3m, 2)}%): ${text}.`,
      available: true,
    });
  }

  if (inp.yield10y && inp.yield10y.closes.length >= 64) {
    const yc = inp.yield10y.closes;
    const last = yc[yc.length - 1];
    const d = last - yc[yc.length - 64];
    let score: number;
    let text: string;
    if (d <= -0.4) {
      score = 2;
      text = "lợi suất đang rơi mạnh — môi trường rất thuận cho vàng";
    } else if (d <= -0.1) {
      score = 1;
      text = "lợi suất đang giảm — thuận lợi cho vàng";
    } else if (d < 0.1) {
      score = 0;
      text = "lợi suất đi ngang";
    } else if (d < 0.4) {
      score = -1;
      text = "lợi suất nhích lên — bất lợi nhẹ cho vàng";
    } else {
      score = -2;
      text = "lợi suất tăng mạnh — sức ép lớn lên vàng";
    }
    const kind = inp.yield10y.real ? "thực (TIPS)" : "danh nghĩa";
    signals.push({
      id: "yield10y",
      label: "Lợi suất Mỹ 10 năm",
      score,
      explanation: `Lợi suất ${kind} 10 năm = ${fmt(last, 2)}%, thay đổi 3 tháng ${d >= 0 ? "+" : ""}${fmt(d, 2)} điểm: ${text}.`,
      available: true,
    });
  } else if (inp.yield10y) {
    signals.push(unavailable("yield10y", "Lợi suất Mỹ 10 năm"));
  }

  if (inp.vixCloses && inp.vixCloses.length >= 1) {
    const vix = inp.vixCloses[inp.vixCloses.length - 1];
    let score = 0;
    let text = "thị trường tài chính bình ổn — trung tính với vàng.";
    if (vix >= 40) {
      score = 2;
      text = "hoảng loạn tài chính — dòng tiền trú ẩn thường đổ vào vàng.";
    } else if (vix >= 30) {
      score = 1;
      text = "căng thẳng tài chính cao — vàng được hưởng cầu trú ẩn.";
    }
    signals.push({
      id: "vix",
      label: "Chỉ số sợ hãi VIX",
      score,
      explanation: `VIX = ${fmt(vix)}: ${text}`,
      available: true,
    });
  }

  if (inp.gprCloses && inp.gprCloses.length >= 100) {
    const pr = percentileRank(inp.gprCloses, 504) ?? 50;
    const last = inp.gprCloses[inp.gprCloses.length - 1];
    let score = 0;
    let text = "rủi ro địa chính trị ở mức bình thường.";
    if (pr >= 95) {
      score = 2;
      text = "rủi ro địa chính trị cực cao (chiến tranh/khủng hoảng) — cầu trú ẩn mạnh.";
    } else if (pr >= 85) {
      score = 1;
      text = "rủi ro địa chính trị dâng cao — hỗ trợ giá vàng.";
    }
    signals.push({
      id: "gpr",
      label: "Rủi ro địa chính trị (GPR)",
      score,
      explanation: `GPR = ${fmt(last, 0)}, percentile ${fmt(pr, 0)} so với 2 năm: ${text}`,
      available: true,
    });
  }

  const uv = inp.usdVndHistory;
  if (uv.length < 2) {
    signals.push(unavailable("usdvnd", "Tỷ giá USD/VND"));
  } else {
    const last = uv[uv.length - 1];
    const target = new Date(new Date(last.date).getTime() - 30 * 86400000);
    let base = uv[0];
    for (const e of uv) {
      if (new Date(e.date) <= target) base = e;
    }
    const spanDays = Math.max(
      1,
      (new Date(last.date).getTime() - new Date(base.date).getTime()) / 86400000
    );
    const pacePerMonth = ((last.value - base.value) / base.value) * 100 * (30 / spanDays);
    let score = 0;
    let text = "tỷ giá ổn định — trung tính.";
    if (pacePerMonth > 1) {
      score = 1;
      text = "tỷ giá tăng nhanh — giá vàng VN được đẩy thêm, lợi cho người đang giữ vàng.";
    } else if (pacePerMonth < -1) {
      score = -1;
      text = "tỷ giá giảm — bớt lực đẩy nội tệ cho giá vàng VN.";
    }
    signals.push({
      id: "usdvnd",
      label: "Tỷ giá USD/VND",
      score,
      explanation: `USD/VND ${fmt(last.value, 0)}, nhịp ${pacePerMonth >= 0 ? "+" : ""}${fmt(pacePerMonth)}%/tháng: ${text}`,
      available: true,
    });
  }

  return finish("macro", signals);
}

/** Tiêu chí 5 (backtest + live): động lượng giá XAU/USD 12 tháng (trend-following). */
export function momentumCriterion(closes: number[]): CriterionResult {
  const signals: SubSignal[] = [];

  if (closes.length < 253) {
    signals.push(unavailable("mom12m", "Động lượng XAU 12 tháng"));
  } else {
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 253];
    const mom = (last / prev - 1) * 100;
    let score: number;
    let text: string;
    if (mom > 20) {
      score = 2;
      text = "đà tăng mạnh — xu hướng bull rõ, thuận mua theo trend";
    } else if (mom > 5) {
      score = 1;
      text = "đà tăng vừa — xu hướng tích cực";
    } else if (mom > -10) {
      score = 0;
      text = "không có xu hướng rõ 12 tháng";
    } else if (mom > -25) {
      score = -1;
      text = "đà giảm — xu hướng bear, hạn chế mua";
    } else {
      score = -2;
      text = "đà giảm mạnh — thị trường bear sâu, tránh mua";
    }
    signals.push({
      id: "mom12m",
      label: "Động lượng XAU 12 tháng",
      score,
      explanation: `XAU/USD thay đổi ${mom >= 0 ? "+" : ""}${fmt(mom)}% so với 12 tháng trước: ${text}.`,
      available: true,
    });
  }

  return finish("momentum", signals);
}

/**
 * Lợi suất 63 phiên tới trung bình theo tháng dương lịch, tính trên chuỗi được truyền.
 *
 * Gọi bằng TIỀN TỐ (closes.slice(0, i+1)) nếu đang chấm điểm một ngày lịch sử — truyền
 * toàn chuỗi cho điểm quá khứ là look-ahead (bug #10, sửa 2026-09-04; khóa bằng test
 * "walk-forward: cắt bớt bar tương lai KHÔNG đổi điểm quá khứ" trong tests/engine.test.ts).
 */
export function seasonalityTable(closes: number[], dates: string[]): Map<number, number> {
  const sums = new Map<number, { s: number; n: number }>();
  for (let i = 0; i + 63 < closes.length; i++) {
    const m = new Date(dates[i]).getUTCMonth() + 1;
    const r = (closes[i + 63] / closes[i] - 1) * 100;
    const cur = sums.get(m) ?? { s: 0, n: 0 };
    cur.s += r;
    cur.n++;
    sums.set(m, cur);
  }
  const out = new Map<number, number>();
  for (const [m, { s, n }] of sums) out.set(m, s / n);
  return out;
}

/** Tiêu chí 4: thống kê lịch sử giá XAU. dates song song với closes. */
export function statsCriterion(
  closes: number[],
  dates: string[],
  seasonality?: Map<number, number>
): CriterionResult {
  const signals: SubSignal[] = [];

  const pctScore = (pr: number): number => {
    if (pr <= 10) return 2;
    if (pr <= 30) return 1;
    if (pr >= 90) return -2;
    if (pr >= 70) return -1;
    return 0;
  };
  const pctText = (pr: number): string => {
    if (pr <= 30) return "vùng giá thấp lịch sử — thuận mua";
    if (pr >= 70) return "vùng giá cao lịch sử — thuận bán";
    return "vùng giữa, không có lợi thế thống kê";
  };

  for (const [id, label, window] of [
    ["pct1y", "Percentile giá so với 1 năm", 252],
    ["pct3y", "Percentile giá so với 3 năm", 756],
  ] as const) {
    if (closes.length < window) {
      signals.push(unavailable(id, label));
    } else {
      const pr = percentileRank(closes, window)!;
      signals.push({
        id,
        label,
        score: pctScore(pr),
        explanation: `Giá hiện tại cao hơn ${fmt(pr, 0)}% số phiên trong ${window === 252 ? "1 năm" : "3 năm"} qua: ${pctText(pr)}.`,
        available: true,
      });
    }
  }

  const season = seasonality ?? seasonalityTable(closes, dates);
  const month = new Date(dates[dates.length - 1]).getUTCMonth() + 1;
  const avg = season.get(month);
  if (avg === undefined) {
    signals.push(unavailable("season", "Mùa vụ theo tháng"));
  } else {
    // Ngưỡng TUYỆT ĐỐI ±2 làm phía âm chết hẳn với tài sản xu-hướng-tăng (bug #8):
    // 0/12 tháng cho −1, 62% quan sát cho +1. ĐÃ ĐO KỸ 2026-09-04 và giữ nguyên có chủ ý —
    // 9 biến thể (abs 1/2/3 · de-trend chéo-tháng 0,5/1/2 · rank 2/3/4) × 3 kỳ hạn = 27 ô,
    // 0 ô qua cổng (CI95 trùm baseline mọi ô, không ô nào vượt placebo chọn ngẫu nhiên
    // CÙNG SỐ THÁNG) ⇒ tháng lịch không mang thông tin, không phải sai ngưỡng. Bỏ hẳn
    // signal cũng không có bằng chứng (ablation: tệ hơn 1,2–1,9pt ở 3/6 ô nhưng n=16–32,
    // CI [46–100] ⇒ nhiễu). Scripts: seasonality-detrend-study.ts, seasonality-ablation.ts;
    // bảng: docs/presets.md "Mùa vụ theo tháng — de-trend NO-GO". Đừng đổi ngưỡng ở đây
    // mà không chạy lại CẢ HAI script — placebo cùng-số-tháng đã đóng chung cả họ này.
    let score = 0;
    let text = "tháng này lịch sử không nghiêng rõ bên nào.";
    if (avg >= 2) {
      score = 1;
      text = "lịch sử 3 tháng sau thời điểm này giá thường tăng — thuận mua sớm.";
    } else if (avg <= -2) {
      score = -1;
      text = "lịch sử 3 tháng sau thời điểm này giá thường giảm — không vội mua.";
    }
    const tetNote =
      month === 12 || month === 1 || month === 2
        ? " Lưu ý mùa Tết/Thần Tài: nhu cầu vàng VN thường đẩy chênh lệch lên cao."
        : "";
    signals.push({
      id: "season",
      label: "Mùa vụ theo tháng",
      score,
      explanation: `Tháng ${month}: lợi suất 3 tháng tiếp theo trung bình ${avg >= 0 ? "+" : ""}${fmt(avg)}% trong lịch sử: ${text}${tetNote}`,
      available: true,
    });
  }

  const vol = volatility30(closes);
  if (vol === null || closes.length < 756) {
    signals.push(unavailable("vol", "Chế độ biến động 30 ngày"));
  } else {
    const vols: number[] = [];
    for (let i = 756; i <= closes.length; i += 5) {
      const v = volatility30(closes.slice(0, i));
      if (v !== null) vols.push(v);
    }
    let below = 0;
    for (const v of vols) if (v < vol) below++;
    const pr = vols.length > 1 ? (below / (vols.length - 1)) * 100 : 50;
    let score = 0;
    let text = "biến động bình thường.";
    if (pr >= 80) {
      score = -1;
      text = "thị trường đang sốt nóng — xác suất quyết định sai cao, nên chờ.";
    } else if (pr <= 20) {
      score = 1;
      text = "thị trường yên ắng — vào lệnh ít rủi ro trượt giá.";
    }
    signals.push({
      id: "vol",
      label: "Chế độ biến động 30 ngày",
      score,
      explanation: `Biến động 30 ngày (annualized) = ${fmt(vol)}%, percentile ${fmt(pr, 0)} so với 3 năm: ${text}`,
      available: true,
    });
  }

  return finish("stats", signals);
}
