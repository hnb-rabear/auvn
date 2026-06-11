/**
 * Gửi Telegram khi preset chuyển TRẠNG THÁI vào/ra vùng mua (chống spam:
 * chỉ báo lúc chuyển, không lặp lại mỗi cron). Chạy sau run.ts trong CI.
 *
 * Cần env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (GitHub secrets).
 * Không có env -> thoát êm (tính năng tùy chọn).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  compositeScore,
  zoneOf,
  PRESETS,
  ZONE_LABELS,
  type Analysis,
  type PresetHealthFile,
  type Zone,
} from "../src/lib/types";

const DATA_DIR = join(process.cwd(), "public", "data");
const STATE_FILE = join(DATA_DIR, "notify-state.json");

function isBuy(zone: Zone): boolean {
  return zone === "buy" || zone === "strong-buy";
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(20000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("notify: thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID — bỏ qua.");
    return;
  }

  const analysis: Analysis = JSON.parse(
    readFileSync(join(DATA_DIR, "analysis.json"), "utf8")
  );

  let state: Record<string, string> = {};
  if (existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    } catch {}
  }

  const lines: string[] = [];
  const newState: Record<string, string> = {};

  for (const p of PRESETS) {
    const composite = compositeScore(analysis.criteria, p.weights);
    const zone = zoneOf(composite, p.buyThreshold);
    newState[p.id] = zone;
    const prev = (state[p.id] as Zone) ?? "neutral";
    if (isBuy(zone) && !isBuy(prev as Zone)) {
      lines.push(
        `🟢 <b>${p.label}</b>: vào ${ZONE_LABELS[zone]} (điểm ${composite >= 0 ? "+" : ""}${composite}). ` +
          `Lịch sử tín hiệu này đúng ${p.evidence.testFav}% giai đoạn 2019–2026.`
      );
    } else if (!isBuy(zone) && isBuy(prev as Zone)) {
      lines.push(`⚪ <b>${p.label}</b>: rời vùng mua (điểm ${composite >= 0 ? "+" : ""}${composite}).`);
    }
  }

  // cảnh báo preset thoái hóa (chỉ khi chuyển trạng thái)
  const healthFile = join(DATA_DIR, "preset-health.json");
  if (existsSync(healthFile)) {
    try {
      const health: PresetHealthFile = JSON.parse(readFileSync(healthFile, "utf8"));
      for (const item of health.items) {
        const key = `health:${item.presetId}`;
        newState[key] = item.status;
        if (item.status === "degraded" && state[key] !== "degraded") {
          const p = PRESETS.find((q) => q.id === item.presetId);
          lines.push(
            `🟠 Preset <b>${p?.label ?? item.presetId}</b> đang mất phong độ trên dữ liệu mới ` +
              `(lợi thế ${item.minExcessNowPt ?? "—"}pt, 2 năm gần nhất ${item.recentFavPct ?? "—"}% vs baseline ${item.recentBaselinePct ?? "—"}%).`
          );
        }
      }
    } catch {}
  }

  // cảnh báo vùng bán theo cấu hình mặc định (chỉ khi chuyển trạng thái)
  const defaultZone = analysis.zone;
  newState["default"] = defaultZone;
  const prevDefault = state["default"] ?? "neutral";
  const isSell = (z: string) => z === "sell" || z === "strong-sell";
  if (isSell(defaultZone) && !isSell(prevDefault)) {
    lines.push(
      `🟡 Chế độ toàn cảnh vào <b>${ZONE_LABELS[defaultZone as Zone]}</b> (điểm ${analysis.composite}). ` +
        `Đây là cảnh báo BỚT MUA THÊM, không phải khuyến nghị bán — backtest 17 năm: tín hiệu bán chỉ đúng 49% sau 1 tháng.`
    );
  }

  writeFileSync(STATE_FILE, JSON.stringify(newState, null, 1));

  if (lines.length === 0) {
    console.log("notify: không có chuyển trạng thái — không gửi.");
    return;
  }

  const sjc = analysis.prices.sjcSell;
  const header =
    `<b>VùngVàng</b> ${analysis.dataDate}\n` +
    `SJC ${sjc ? (sjc / 1_000_000).toFixed(1) + "tr" : "—"} · ` +
    `XAU $${analysis.prices.xauUsd?.toFixed(0) ?? "—"} · ` +
    `chênh ${analysis.prices.premiumPct ?? "—"}%\n\n`;
  const ok = await sendTelegram(token, chatId, header + lines.join("\n"));
  console.log(ok ? `notify: đã gửi ${lines.length} cảnh báo.` : "notify: gửi Telegram THẤT BẠI.");
}

main().catch((e) => {
  // không làm fail cron vì lỗi thông báo
  console.error("notify error:", e);
});
