/**
 * Tuyển chọn preset trọng số cho từng kỳ hạn 1/3/6 tháng.
 *
 * Phương pháp: grid search trọng số (bước 10%) × ngưỡng mua (30..60) trên
 * timeline thật, chia 2 giai đoạn độc lập: train 2009–2018, test 2019–2026.
 * Điều kiện nhận: ≥25 tín hiệu mỗi giai đoạn VÀ thắng baseline (mua ngày
 * bất kỳ) ở CẢ HAI giai đoạn. Xếp hạng theo lợi thế tệ nhất trong 2 giai
 * đoạn (ưu tiên ổn định, không ưu tiên đỉnh cao ăn may).
 *
 * Chạy: npm run collect (tạo timeline.json) rồi npx tsx scripts/presets-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";
import { gridSearch, fmtCand, type H } from "./study-lib";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);

function main() {
  for (const h of ["21", "63", "126"] as H[]) {
    const { baseTrain, baseTest, trainN, testN, candidates } = gridSearch(tl.points, h);
    console.log(`\n========== KỲ HẠN ${h} phiên ==========`);
    console.log(
      `train n=${trainN} baseline=${(baseTrain * 100).toFixed(1)}% | test n=${testN} baseline=${(baseTest * 100).toFixed(1)}%`
    );
    if (candidates.length === 0) {
      console.log(
        "KHÔNG có cấu hình nào thắng baseline ổn định ở cả 2 giai đoạn -> không nên phát hành preset cho kỳ hạn này."
      );
      continue;
    }
    console.log(`đạt chuẩn: ${candidates.length} cấu hình. TOP 5 theo lợi thế tệ nhất:`);
    for (const c of candidates.slice(0, 5)) console.log(fmtCand(c));
  }
}
main();
