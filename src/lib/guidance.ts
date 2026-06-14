/**
 * Lớp "Gợi ý hành động" — CHỈ ĐỌC. Đọc composite (điểm mua/bán), gauge săn đáy
 * và chênh lệch VN rồi dịch ra hành động cụ thể: KHI NÀO mua + MUA NHƯ THẾ NÀO.
 *
 * KHÔNG trộn điểm: không sửa composite, không sửa xác suất đáy. Đây là một view
 * dẫn xuất từ ba tín hiệu độc lập (xem CLAUDE.md: Bottom Hunter không đụng composite).
 *
 * Triết lý phản ánh phát hiện thực nghiệm (docs/bottom.md "Săn đáy vs Điểm mua"):
 * hai tín hiệu hiếm khi cùng sáng, nên ô hay gặp nhất là "gom rải / quan sát",
 * không phải "tất tay". Tất cả là hỗ trợ quyết định, không phải khuyến nghị.
 */
import type { Zone } from "./types";

export type GuidanceLevel =
  | "strong" // composite mua + XAU dò đáy: tín hiệu mạnh nhất (hiếm)
  | "buy" // composite mua, đáy chưa xác nhận
  | "dca" // composite trung tính nhưng XAU dò đáy: gom rải
  | "wait" // chưa có tín hiệu
  | "premium-wait" // tín hiệu thế giới có nhưng vàng VN đang đắt
  | "reduce"; // composite vùng bán

/**
 * Mô tả tín hiệu đáy do caller tự dựng — tách khỏi nguồn (prob% live vs bin lịch sử).
 * Live: high = cycleProb≥60 & verified; History: high = cycleBin===topBin (past-only,
 * không dùng prob% vì prob là base-rate toàn lịch sử ⇒ look-ahead).
 */
export interface BottomDescriptor {
  /** tín hiệu đáy đang ở mức "cao" (đủ để kích hoạt dca/strong) */
  high: boolean;
  /** có dữ liệu kiểm chứng / đã qua warmup; false ⇒ ghi "chưa đủ dữ liệu kiểm chứng" */
  verified: boolean;
  /** chuỗi lý do hiển thị, do caller dựng (live: prob%; history: bin) */
  label: string;
}

export interface GuidanceInput {
  zone: Zone;
  composite: number;
  /** mô tả tín hiệu đáy (caller dựng từ prob% hoặc bin) */
  bottom: BottomDescriptor;
  /** chênh lệch VN−TG hiện tại (%), null nếu thiếu */
  premiumPct: number | null;
  /** ngưỡng p80 của chênh lệch lịch sử; null nếu chưa đủ lịch sử (<90 ngày) để xếp hạng */
  premiumP80: number | null;
}

export interface Guidance {
  level: GuidanceLevel;
  tone: "buy" | "neutral" | "sell";
  /** KHI NÀO — tiêu đề hành động ngắn */
  when: string;
  /** MUA NHƯ THẾ NÀO — cách thực thi */
  how: string;
  /** lý do ngắn từ 3 tín hiệu, hiển thị dạng danh sách */
  reasons: string[];
}

const fmt = (n: number, d = 1) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });
const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : fmt(n));

export function deriveGuidance(inp: GuidanceInput): Guidance {
  const isSell = inp.zone === "sell" || inp.zone === "strong-sell";
  const isBuy = inp.zone === "buy" || inp.zone === "strong-buy";
  const strongBuy = inp.zone === "strong-buy";
  const bottomHigh = inp.bottom.verified && inp.bottom.high;
  const anyVerified = inp.bottom.verified;

  const premiumKnown = inp.premiumPct !== null && inp.premiumP80 !== null;
  const premiumHigh = premiumKnown && (inp.premiumPct as number) >= (inp.premiumP80 as number);

  // --- lý do từ 3 tín hiệu (luôn hiển thị để giải thích được)
  const reasons: string[] = [];
  reasons.push(
    isBuy
      ? `Điểm mua: vùng MUA${strongBuy ? " mạnh" : ""} (${signed(inp.composite)}).`
      : isSell
        ? `Điểm mua: vùng BÁN (${signed(inp.composite)}).`
        : `Điểm mua: trung tính (${signed(inp.composite)}) — chưa có tín hiệu mua.`
  );
  reasons.push(
    anyVerified ? inp.bottom.label : "Săn đáy: chưa đủ dữ liệu kiểm chứng."
  );
  if (!premiumKnown) {
    reasons.push(
      inp.premiumPct === null
        ? "Chênh VN: chưa có dữ liệu."
        : `Chênh VN: ${fmt(inp.premiumPct as number)}% (chưa đủ lịch sử để xếp hạng).`
    );
  } else {
    reasons.push(
      `Chênh VN: ${fmt(inp.premiumPct as number)}% — ${premiumHigh ? "CAO (≥ p80, vàng VN đang đắt)" : "chưa cao"}.`
    );
  }

  // --- vùng bán: không phải lúc mua (giữ nguyên thông điệp backtest của app)
  if (isSell) {
    return {
      level: "reduce",
      tone: "sell",
      when: "Vùng bán — không phải lúc mua",
      how: "Bớt mua thêm, KHÔNG bán tháo: backtest 17 năm cho thấy tín hiệu bán sai tới 75% sau 12 tháng. Bán theo kế hoạch kỳ hạn của bạn.",
      reasons,
    };
  }

  // --- cổng premium: vàng VN đắt thì người mua vàng vật chất không nên đuổi giá,
  // kể cả khi tín hiệu thế giới (composite/đáy) đang thuận.
  if (premiumHigh) {
    return {
      level: "premium-wait",
      tone: "neutral",
      when: "Vàng VN đang đắt so với thế giới",
      how:
        (isBuy || bottomHigh
          ? "Tín hiệu thế giới đang thuận NHƯNG chênh VN cao — "
          : "") +
        "đợi chênh lệch hạ về vùng thấp hơn; nếu vẫn muốn vào, ưu tiên nhẫn (nếu nhẫn chiết khấu so với SJC) và mua rải từng phần nhỏ.",
      reasons,
    };
  }

  // --- ma trận điểm mua × săn đáy (premium đã ở mức chấp nhận được)
  if (isBuy && bottomHigh) {
    return {
      level: "strong",
      tone: "buy",
      when: "Tín hiệu mạnh nhất — định giá thuận VÀ XAU đang dò đáy",
      how: "Vùng đáng gom dứt khoát hơn. Vẫn nên chia 2–3 đợt để phòng nhận định sai — không dồn hết một lần.",
      reasons,
    };
  }
  if (isBuy && !bottomHigh) {
    return {
      level: "buy",
      tone: "buy",
      when: "Định giá / kỹ thuật đang thuận",
      how: "Gom theo kế hoạch. XAU chưa xác nhận đáy nên đừng kỳ vọng bắt đúng đáy — chia nhiều đợt vẫn an toàn hơn.",
      reasons,
    };
  }
  if (!isBuy && bottomHigh) {
    return {
      level: "dca",
      tone: "buy",
      when: "XAU đang dò vùng đáy nhọn (điểm mua chưa xác nhận)",
      how: "Gom RẢI (DCA) từng phần nhỏ, giữ lại phần lớn vốn để bồi khi điểm mua composite xác nhận xu hướng. Đây là vùng dao có thể còn rơi.",
      reasons,
    };
  }
  return {
    level: "wait",
    tone: "neutral",
    when: "Chưa có tín hiệu rõ",
    how: "Quan sát, chưa cần hành động. Tín hiệu mua chỉ xuất hiện vài đợt mỗi năm — im lặng là bình thường.",
    reasons,
  };
}
