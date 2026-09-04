/**
 * Lợi nhuận RÒNG một vòng mua-bán vàng miếng SJC bằng giá NIÊM YẾT THẬT.
 *
 * Vì sao cần: evidence của preset đo trên XAU/USD 15 năm — giá thế giới, KHÔNG
 * spread, KHÔNG phí. Người dùng VN mua ở giá `sjcSell` và bán lại ở giá `sjcBuy`,
 * nên số +4,1% trên thẻ KHÔNG phải tiền vào tay. Script này đo phần bị mất, bằng
 * chính lịch sử đã tích lũy trong public/data/history/vn-gold.json.
 *
 * net(t,H) = sjcBuy[t+H] / sjcSell[t] − 1      (mua giá bán, bán giá mua)
 * gross(t,H) = sjcSell[t+H] / sjcSell[t] − 1   (đối chứng: bỏ qua spread)
 *
 * CẢNH BÁO CỠ MẪU: lịch sử SJC hiện chỉ ~19 tháng và toàn bộ nằm trong MỘT chế độ
 * bull. Đây là số MÔ TẢ giai đoạn đã có, KHÔNG phải evidence 2 giai đoạn — không
 * được trình bày như tỉ lệ đúng đã kiểm chứng. Chạy lại khi đủ ≥36 tháng (P2-3).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blockBootstrapCi } from "../src/lib/indicators";
import type { VnGoldEntry } from "../src/lib/types";

const FILE = join(process.cwd(), "public", "data", "history", "vn-gold.json");
const HORIZONS = [30, 60, 90, 180];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (x: number) => Math.round(x * 100) / 100;

function main() {
  const hist: VnGoldEntry[] = JSON.parse(readFileSync(FILE, "utf8"));
  const rows = hist.filter((e) => e.sjcBuy != null && e.sjcSell != null);
  // Các entry là ngày DƯƠNG LỊCH liên tiếp (không phải phiên) — tra theo ngày thật,
  // không cộng index, để 2 khoảng trống trong lịch sử không làm lệch kỳ hạn.
  const byDate = new Map(rows.map((e) => [e.date, e]));
  const addDays = (iso: string, d: number) =>
    new Date(new Date(iso).getTime() + d * 86400_000).toISOString().slice(0, 10);

  const spreads = rows.map((e) => ((e.sjcSell! - e.sjcBuy!) / e.sjcSell!) * 100);
  console.log(`Lịch sử SJC: ${rows.length} ngày, ${rows[0].date} → ${rows[rows.length - 1].date}`);
  console.log(
    `Spread mua-bán: trung vị ${r1(median(spreads))}%, min ${r1(Math.min(...spreads))}%, max ${r1(Math.max(...spreads))}%\n`
  );

  console.log("H(ngày) | n   | RÒNG trung vị | %dương | CI95 %dương  | GROSS trung vị | chênh");
  for (const H of HORIZONS) {
    const net: number[] = [];
    const gross: number[] = [];
    for (const e of rows) {
      const fut = byDate.get(addDays(e.date, H));
      if (!fut) continue;
      net.push((fut.sjcBuy! / e.sjcSell! - 1) * 100);
      gross.push((fut.sjcSell! / e.sjcSell! - 1) * 100);
    }
    if (net.length < 10) {
      console.log(`${String(H).padStart(7)} | ${String(net.length).padStart(3)} | chưa đủ dữ liệu`);
      continue;
    }
    const pos = (net.filter((x) => x > 0).length / net.length) * 100;
    // block = H ngày: các cửa sổ kề nhau chồng lấn nên coi mỗi khối là 1 quan sát độc lập.
    const ci = blockBootstrapCi(net, H);
    console.log(
      `${String(H).padStart(7)} | ${String(net.length).padStart(3)} | ` +
        `${(r1(median(net)) + "%").padStart(13)} | ${(r1(pos) + "%").padStart(6)} | ` +
        `${(ci ? `${ci[0]}–${ci[1]}%` : "—").padStart(12)} | ` +
        `${(r1(median(gross)) + "%").padStart(14)} | ${r1(median(gross) - median(net))}pt`
    );
  }
  console.log(
    "\nMỘT chế độ bull, ~19 tháng ⇒ số MÔ TẢ, không phải evidence 2 giai đoạn. Xem docs/presets.md."
  );
}

main();
