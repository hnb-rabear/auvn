/**
 * Giám sát thoái hóa preset: mỗi cron tính lại hiệu quả của ĐÚNG cấu hình
 * preset đang phát hành trên timeline mới nhất.
 *  - minExcessNowPt: lợi thế tệ nhất 2 giai đoạn (như lúc tuyển chọn)
 *  - recent: hiệu quả 2 năm gần nhất vs baseline cùng kỳ
 *  - testFavCi95: block bootstrap CI cho % đúng giai đoạn test
 * status=degraded khi min-excess < 5pt HOẶC 2 năm gần nhất không thắng baseline.
 * Ghi public/data/preset-health.json — UI và notify đọc file này.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type PresetHealth, type PresetHealthFile, type Timeline } from "../src/lib/types";
import { stats, blockBootstrapCi, SPLIT_DATE, MIN_SIGNALS, type H } from "./study-lib";

const DATA_DIR = join(process.cwd(), "public", "data");
const STEP = 3;

function main() {
  const tl: Timeline = JSON.parse(readFileSync(join(DATA_DIR, "timeline.json"), "utf8"));

  const items: PresetHealth[] = [];
  for (const p of PRESETS) {
    const h = String(p.horizonDays) as H;
    const pts = tl.points.filter((q) => q.returns[h] !== null);
    const train = pts.filter((q) => q.date < SPLIT_DATE);
    const test = pts.filter((q) => q.date >= SPLIT_DATE);

    // v4: presetComposite — sub-signal vĩ mô trọng số riêng (cùng hàm với UI/notify).
    const hit = (data: typeof pts) =>
      data.filter((q) => presetComposite(q.scores, p) >= p.buyThreshold).map((q) => q.returns[h] as number);

    const trSig = stats(hit(train));
    const teSig = stats(hit(test));
    const trBase = stats(train.map((q) => q.returns[h] as number));
    const teBase = stats(test.map((q) => q.returns[h] as number));

    // 2 năm gần nhất (có dữ liệu tương lai đủ kỳ hạn)
    const lastDate = pts[pts.length - 1]?.date ?? "";
    const cutoff = new Date(new Date(lastDate).getTime() - 2 * 365 * 86400000)
      .toISOString()
      .slice(0, 10);
    const recent = pts.filter((q) => q.date >= cutoff);
    const recSig = stats(hit(recent));
    const recBase = stats(recent.map((q) => q.returns[h] as number));

    const enough = trSig.n >= MIN_SIGNALS && teSig.n >= MIN_SIGNALS;
    const minExcess = enough
      ? Math.min(trSig.fav - trBase.fav, teSig.fav - teBase.fav)
      : null;
    const ci = blockBootstrapCi(hit(test), Math.ceil(p.horizonDays / STEP));

    // degraded = lợi thế tuyển chọn sụp (<5pt) HOẶC 2 năm gần nhất THUA baseline
    // quá 5pt (hòa baseline trong bull market không tính — vô hại).
    let status: PresetHealth["status"];
    if (!enough) status = "insufficient";
    else if (
      (minExcess !== null && minExcess < 0.05) ||
      (recSig.n >= 10 && recSig.fav < recBase.fav - 0.05)
    )
      status = "degraded";
    else status = "ok";

    items.push({
      presetId: p.id,
      minExcessNowPt: minExcess === null ? null : Math.round(minExcess * 1000) / 10,
      recentFavPct: recSig.n ? Math.round(recSig.fav * 1000) / 10 : null,
      recentBaselinePct: recBase.n ? Math.round(recBase.fav * 1000) / 10 : null,
      recentN: recSig.n,
      testFavCi95: ci,
      status,
    });
    console.log(
      `${p.id}: status=${status} minExcess=${minExcess === null ? "—" : (minExcess * 100).toFixed(1) + "pt"} ` +
        `recent=${recSig.n ? (recSig.fav * 100).toFixed(1) + "% (n=" + recSig.n + ", base " + (recBase.fav * 100).toFixed(1) + "%)" : "—"} ` +
        `CI95=${ci ? ci[0] + ".." + ci[1] + "%" : "—"}`
    );
  }

  const out: PresetHealthFile = { generatedAt: new Date().toISOString(), items };
  writeFileSync(join(DATA_DIR, "preset-health.json"), JSON.stringify(out, null, 1));
}

main();
