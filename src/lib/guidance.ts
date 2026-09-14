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
  | "dca" // không còn bắn — NO-GO 2026-07, docs/bottom.md
  | "wait" // chưa có tín hiệu
  | "premium-wait" // KHÔNG còn bắn — hạ cấp 2026-09-15, xem isPremiumHigh. Giữ trong union để consumer cũ không vỡ.
  | "headwind"; // composite âm sâu (≤−40): với người MUA tương đương quan sát, chỉ thêm ngữ cảnh gió ngược

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
  /**
   * Câu lý do "Điểm mua: …" do caller tự dựng — dùng khi trục mua KHÔNG phải là
   * composite (chế độ đồng thuận preset: zone dựng từ k/3 preset, composite chỉ là
   * radar ngữ cảnh nên câu mặc định "vùng MUA (+13)" sẽ nói dối). Không đổi logic
   * level/tone — chỉ thay chuỗi hiển thị đầu tiên trong reasons.
   */
  scoreReason?: string;
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

/**
 * Chênh VN ≥ p80 lịch sử tự thu thập = đang MUA ĐẮT hơn giá thế giới quy đổi.
 *
 * HẠ CẤP 2026-09-15 (`scripts/premium-gate-study.ts`) — đây là GHI CHÚ CHI PHÍ, không
 * còn là cổng chặn. Trước đó nó return sớm level "premium-wait" ("đợi chênh lệch hạ"),
 * đè lên cả tín hiệu preset lẫn tín hiệu đáy. Đo lại ở ĐÚNG kỳ hạn quyết định của nó
 * (người mua hoãn vài phiên, không phải 126 phiên):
 *
 *   H=5  40 cụm: P(giá rẻ hơn sau H) 34,7% vs base 40,0% = **−5,2pt — SAI DẤU**
 *   H=10 26 cụm: +0,7pt   H=21 16 cụm: +8,9pt   H=63 7 cụm: +2,9pt (đều ≪ MDE ±25..37pt)
 *
 * H=5 là ô có công suất cao nhất (40 cụm độc lập) và nó nói NGƯỢC lại lời khuyên "đợi".
 * Bằng chứng từng chống lưng cổng chỉ là `premium-buy-study` n=7, một chế độ thị trường.
 * Cổng đè 8/45 = 18% số ngày preset báo mua (chỉ 2 cụm độc lập nên kết cục 4/8 tăng,
 * trung vị +0,4% H21 KHÔNG chứng minh được cổng gây hại — lý do hạ cấp là THIẾU bằng
 * chứng chống lưng, không phải đã đo được thiệt hại).
 *
 * Giữ export: summary.json phát hành cùng một kết luận với UI — consumer không phải tự
 * so sánh lại ngưỡng. Chỉ đổi Ý NGHĨA: "đang mua đắt" (mô tả), không phải "hãy đợi" (dự báo).
 */
export function isPremiumHigh(
  premiumPct: number | null,
  premiumP80: number | null
): boolean {
  return premiumPct !== null && premiumP80 !== null && premiumPct >= premiumP80;
}

export function deriveGuidance(inp: GuidanceInput): Guidance {
  const isSell = inp.zone === "sell" || inp.zone === "strong-sell";
  const isBuy = inp.zone === "buy" || inp.zone === "strong-buy";
  const strongBuy = inp.zone === "strong-buy";
  const bottomHigh = inp.bottom.verified && inp.bottom.high;
  const anyVerified = inp.bottom.verified;

  const premiumKnown = inp.premiumPct !== null && inp.premiumP80 !== null;
  const premiumHigh = isPremiumHigh(inp.premiumPct, inp.premiumP80);

  // --- lý do từ 3 tín hiệu (luôn hiển thị để giải thích được)
  const reasons: string[] = [];
  reasons.push(
    inp.scoreReason ??
      (isBuy
        ? `Điểm mua: vùng MUA${strongBuy ? " mạnh" : ""} (${signed(inp.composite)}).`
        : isSell
          ? `Điểm mua: âm sâu (${signed(inp.composite)}) — gió ngược ngắn hạn, với người mua tương đương trung tính.`
          : `Điểm mua: trung tính (${signed(inp.composite)}) — chưa có tín hiệu mua.`)
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
      `Chênh VN: ${fmt(inp.premiumPct as number)}% — ${
        premiumHigh
          ? "CAO (≥ p80 lịch sử): đang mua đắt hơn giá thế giới quy đổi. Đây là chi phí, không phải tín hiệu đợi — chưa có bằng chứng đợi chênh hạ thì mua được rẻ hơn"
          : "chưa cao"
      }.`
    );
  }

  // --- composite âm sâu: với người MUA đối xử như vùng quan sát (gộp 2026-07-04),
  // chỉ khác ở ngữ cảnh. Bằng chứng — TÁI LẬP bằng scripts/sellzone-regime-study.ts
  // (timeline 2009-09-03..2026-09-04, 396 ngày composite ≤ −40 = 9,3% lịch sử):
  // 1 tháng median gộp −0,3% (44,9% số lần giá cao hơn), theo năm dao động −2,7%..+2,1%
  // ⇒ gió ngược ngắn hạn NHẸ và không đều. 6 tháng thì ĐẢO DẤU theo regime: năm bull
  // 2009/2010/2019/2024/2025 giá cao hơn 98,5–100% số lần (median +4,7..+22%), năm yếu
  // 2011/2016/2018/2022/2023/2026 giá thấp hơn 67–100% (median −2..−13,7%). Không biết
  // trước regime ⇒ không được dịch thành lệnh "bớt mua/cấm mua" cho người tích lũy;
  // phía BÁN chỉ là tham khảo (Time Machine toggle). Vẫn return TRƯỚC ma trận
  // gom-rải: giữ hành vi cũ là không gợi ý gom rải khi composite âm sâu.
  // Số ở đây dẫn xuất từ composite (stats trọng số 0,2) ⇒ chạy lại study sau MỌI
  // lần sửa engine rồi sync text, đừng để trôi (bài học bug #10).
  if (isSell) {
    return {
      level: "headwind",
      tone: "neutral",
      when: "Gió ngược ngắn hạn — chưa phải lúc mua",
      how:
        "Với người mua: như vùng quan sát — các đợt như này giá 1 tháng tới thường đi ngang/giảm nhẹ, không cần vội đuổi giá. " +
        "KHÔNG phải tín hiệu bán: kết cục 6 tháng phụ thuộc thị trường (sai gần như 100% trong năm bull, chỉ đúng ở thị trường yếu) — bán theo kế hoạch kỳ hạn của bạn.",
      reasons,
    };
  }

  // --- chênh VN cao: GHI CHÚ CHI PHÍ, không chặn (hạ cấp 2026-09-15, xem isPremiumHigh).
  // Nối vào `how` của ô thật thay vì return sớm — người mua vẫn thấy tín hiệu đã kiểm
  // chứng 2 giai đoạn, kèm cảnh báo mình đang trả đắt. Lời khuyên "đợi chênh hạ" cũ đo
  // ra SAI DẤU ở kỳ hạn của chính nó (H=5, 40 cụm, −5,2pt).
  const premiumNote = premiumHigh
    ? " Lưu ý chi phí: chênh VN ≥ p80 lịch sử — đang mua đắt hơn giá thế giới quy đổi;" +
      " cân nhắc nhẫn nếu đang chiết khấu so với SJC, và mua rải từng phần nhỏ." +
      " (Chưa có bằng chứng đợi chênh hạ thì mua được rẻ hơn.)"
    : "";

  // --- ma trận điểm mua × săn đáy
  if (isBuy && bottomHigh) {
    return {
      level: "strong",
      tone: "buy",
      when: "Tín hiệu mạnh nhất — định giá thuận VÀ XAU đang dò đáy",
      how:
        "Vùng đáng gom dứt khoát hơn. Vẫn nên chia 2–3 đợt để phòng nhận định sai — không dồn hết một lần." +
        premiumNote,
      reasons,
    };
  }
  if (isBuy && !bottomHigh) {
    return {
      level: "buy",
      tone: "buy",
      when: "Định giá / kỹ thuật đang thuận",
      how:
        "Gom theo kế hoạch. XAU chưa xác nhận đáy nên đừng kỳ vọng bắt đúng đáy — chia nhiều đợt vẫn an toàn hơn." +
        premiumNote,
      reasons,
    };
  }
  return {
    level: "wait",
    tone: "neutral",
    when: "Chưa có tín hiệu rõ",
    how:
      "Quan sát, chưa cần hành động. Tín hiệu mua chỉ xuất hiện vài đợt mỗi năm — im lặng là bình thường." +
      premiumNote,
    reasons,
  };
}
