"use client";

import { useEffect, useMemo, useState } from "react";
import TimeMachine from "./TimeMachine";
import PremiumChart from "./PremiumChart";
import BottomGauges from "./BottomGauges";
import BearDcaCard from "./BearDcaCard";
import BearDownsideCard from "./BearDownsideCard";
import ActionGuidance from "./ActionGuidance";
import SettingsSheet from "./SettingsSheet";
import { fabLabel, zoneClass } from "@/lib/settings";
import { deriveGuidance } from "@/lib/guidance";
import { highConfidenceBuy3m, HIGH_CONF_3M_EVIDENCE } from "@/lib/fusion";
import { timeAgo, isGoldMarketClosed } from "@/lib/freshness";
import { formatBuildInfo } from "@/lib/version";
import {
  compositeScore,
  zoneOf,
  ZONE_LABELS,
  BOTTOM_CONFIG,
  DEFAULT_WEIGHTS,
  PRESETS,
  type AccumulationAnalysis,
  type AccumulationHealth,
  type BearDcaAnalysis,
  type BearDcaHealth,
  type BearDownsideAnalysis,
  type Analysis,
  type Backtest,
  type BottomAnalysis,
  type FusionHealthFile,
  type CriterionKey,
  type CriterionResult,
  type PresetHealthFile,
  type Timeline,
  type Zone,
} from "@/lib/types";

const SETTINGS_KEY = "au-settings-v2";

interface Settings {
  weights: Record<CriterionKey, number>;
  presetId: string | null;
}

const DEFAULT_SETTINGS: Settings = { weights: DEFAULT_WEIGHTS, presetId: null };

const fmtMoney = (v: number | null) =>
  v === null ? "—" : (v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tr";
const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

function scoreChip(score: number) {
  const cls = score > 0 ? "chip buy" : score < 0 ? "chip sell" : "chip neutral";
  const txt = score > 0 ? `+${fmtNum(score)}` : fmtNum(score);
  return <span className={cls}>{txt}</span>;
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (typeof s?.weights?.[k] !== "number" || s.weights[k] < 0) return DEFAULT_SETTINGS;
    }
    return { weights: s.weights, presetId: typeof s.presetId === "string" ? s.presetId : null };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export default function Dashboard({
  analysis,
  backtest,
  timeline,
  health,
  bottom,
  fusionHealth,
  accumulation,
  accumulationHealth,
  bearDca,
  bearDcaHealth,
  bearDownside,
}: {
  analysis: Analysis;
  backtest: Backtest;
  timeline: Timeline;
  health: PresetHealthFile;
  bottom: BottomAnalysis;
  fusionHealth: FusionHealthFile;
  accumulation: AccumulationAnalysis;
  accumulationHealth: AccumulationHealth;
  bearDca: BearDcaAnalysis;
  bearDcaHealth: BearDcaHealth;
  bearDownside: BearDownsideAnalysis;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const weights = settings.weights;
  const preset = PRESETS.find((p) => p.id === settings.presetId) ?? null;
  const presetHealth = preset
    ? health.items.find((i) => i.presetId === preset.id) ?? null
    : null;

  useEffect(() => {
    setSettings(loadSettings());
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }, []);

  const [nowMs, setNowMs] = useState(() => Date.parse(analysis.generatedAt));
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const customized = useMemo(
    () => !preset && JSON.stringify(weights) !== JSON.stringify(DEFAULT_WEIGHTS),
    [preset, weights]
  );
  const composite = useMemo(
    () => compositeScore(analysis.criteria, weights),
    [analysis, weights]
  );
  const rawZone = zoneOf(composite, preset?.buyThreshold ?? 40);
  // Preset chỉ được kiểm chứng phía MUA — không bao giờ hiển thị vùng bán dưới preset.
  const isBuyZone = rawZone === "buy" || rawZone === "strong-buy";
  const zone: Zone = preset && !isBuyZone ? "neutral" : rawZone;
  const isSellZone = zone === "sell" || zone === "strong-sell";
  // Trục verdict chính chỉ còn 3 trạng thái với người mua (gộp 2026-07-04, xem
  // guidance.ts): composite âm sâu KHÔNG hiện "VÙNG BÁN" nữa — nó chưa từng được
  // kiểm chứng làm cổng mua/bán, chỉ còn là ngữ cảnh gió ngược + tham khảo người bán.
  const verdictLabel =
    preset && !isBuyZone
      ? "CHƯA CÓ TÍN HIỆU MUA"
      : isSellZone
        ? "TRUNG LẬP (GIÓ NGƯỢC)"
        : ZONE_LABELS[zone];

  const currentBuckets = backtest.buckets.filter(
    (b) => b.zone === zone && b.count > 0
  );
  const bt63 = currentBuckets.find((b) => b.horizonDays === 63);

  // Gợi ý hành động: kết hợp điểm mua (zone) + săn đáy + chênh lệch VN. Chỉ đọc.
  const cycleVerified = !BOTTOM_CONFIG.cycle.provisional && bottom.cycle.n >= 10;
  const swingVerified = !BOTTOM_CONFIG.swing.provisional && bottom.swing.n >= 10;
  // Tầng "độ tin cao" 3m: bồi evidence khi composite-buy ∧ vùng đáy (cycleBin==3,
  // điểm đáy hiện tại — KHÁC với prob≥60 của guidance "strong") + verified + monitor
  // không báo thoái hóa. Đồng hành với verdict, không phải tập con chặt của "strong".
  const fusionDegraded = fusionHealth.item.status === "degraded";
  const highConf =
    highConfidenceBuy3m(preset?.id ?? null, isBuyZone, bottom.cycle.bin, cycleVerified) &&
    !fusionDegraded;
  // Cổng hiển thị acute-crash (docs/bottom.md "Recency-504"): prob recency đo được là
  // lạc quan giả khi giá đang sụp cấp tính ⇒ mọi nơi đọc prob (gauge, guidance, hero)
  // rớt về bản không trọng số. Tái dùng phase của Bear DCA — không thêm tham số mới.
  const bottomCrashMode = bearDca.phase === "acute";
  const effProb = useMemo(() => {
    const eff = (t: { prob: number; probUnweighted?: number }) =>
      bottomCrashMode ? (t.probUnweighted ?? t.prob) : t.prob;
    return { cycle: eff(bottom.cycle), swing: eff(bottom.swing) };
  }, [bottom, bottomCrashMode]);
  const guidance = useMemo(() => {
    // best = max prob của tầng đã kiểm chứng (khớp ngưỡng gauge ≥60/≥35), giữ nguyên hành vi live cũ
    const c = cycleVerified ? effProb.cycle : -1;
    const s = swingVerified ? effProb.swing : -1;
    const best = Math.max(c, s);
    const lvl = best >= 60 ? "cao" : best >= 35 ? "trung bình" : "thấp";
    const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
    return deriveGuidance({
      zone,
      composite,
      bottom: {
        high: best >= 60,
        verified: cycleVerified || swingVerified,
        label: `Săn đáy: xác suất gần đáy ${lvl} (chu kỳ ${fmt1(effProb.cycle)}%, sóng ${fmt1(effProb.swing)}%${bottomCrashMode ? " — đang sụp cấp tính, dùng ước lượng thận trọng" : ""}).`,
      },
      premiumPct: analysis.prices.premiumPct,
      premiumP80: analysis.premiumPercentiles?.p80 ?? null,
    });
  }, [zone, composite, effProb, bottomCrashMode, cycleVerified, swingVerified, analysis]);

  // nhãn xác suất gần đáy cho dòng cô đọng ở hero (khớp ngưỡng gauge 60/35)
  const nearBottomLabel = useMemo(() => {
    const c = cycleVerified ? effProb.cycle : -1;
    const s = swingVerified ? effProb.swing : -1;
    const best = Math.max(c, s);
    if (best < 0) return "chưa đủ dữ liệu";
    return best >= 60 ? "cao" : best >= 35 ? "trung bình" : "thấp";
  }, [cycleVerified, swingVerified, effProb]);

  const heroMeta = (
    <>
      <b>{verdictLabel}</b>{highConf && <b> · đã kiểm chứng (3 tháng)</b>} · điểm{" "}
      <b>{composite > 0 ? `+${fmtNum(composite)}` : fmtNum(composite)}</b>
      {preset && ` · preset ${preset.label} (ngưỡng mua +${preset.buyThreshold})`}
      {customized && " · trọng số tùy chỉnh"} · xác suất gần đáy {nearBottomLabel}
    </>
  );

  const setWeight = (k: CriterionKey, v: number) => {
    const s: Settings = { weights: { ...weights, [k]: v }, presetId: null };
    setSettings(s);
    saveSettings(s);
  };

  const applyPreset = (id: string | null) => {
    const p = PRESETS.find((q) => q.id === id);
    const s: Settings = p
      ? { weights: p.weights, presetId: p.id }
      : { weights: DEFAULT_WEIGHTS, presetId: null };
    setSettings(s);
    saveSettings(s);
  };

  const clock = new Date(nowMs).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const st = analysis.sourceTimes;
  const worldAge = st ? timeAgo(st.world, nowMs) : null;
  const vnGoldAge = st ? timeAgo(st.vnGold, nowMs) : null;
  // dataDate dạng "YYYY-MM-DD" → "DD/MM"
  const vnDateLabel = (() => {
    const p = analysis.dataDate?.split("-");
    return p && p.length === 3 ? `${p[2]}/${p[1]}` : analysis.dataDate;
  })();

  // dòng tóm tắt; fallback về generatedAt nếu thiếu sourceTimes (file data cũ)
  const freshnessFallback = new Date(analysis.generatedAt).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return (
    <main className="wrap">
      <header className="top">
        <h1>
          Vùng<span className="gold">Vàng</span>
        </h1>
      </header>

      {analysis.stale && (
        <div className="banner warn">
          ⚠ Dữ liệu giá vàng VN cũ {analysis.staleDays} ngày — nguồn giá đang gián đoạn.
        </div>
      )}
      {analysis.warnings.map((w, i) => (
        <div key={i} className="banner info">
          {w}
        </div>
      ))}
      {presetHealth?.status === "degraded" && (
        <div className="banner warn">
          ⚠ Preset {preset!.label} đang mất phong độ trên dữ liệu mới (kiểm tra tự động mỗi
          cron) — cân nhắc dùng cấu hình mặc định hoặc chờ tuyển lại preset.
        </div>
      )}

      {/* ── HERO: câu chốt 3 giây (gộp verdict + gợi ý hành động) ── */}
      <ActionGuidance
        guidance={guidance}
        meta={heroMeta}
        note={
          <>
            {isSellZone && (
              <div className="verdict-note">
                ⓘ Tham khảo cho người BÁN (không phải tín hiệu cho người mua): composite ≤ −40
                trong lịch sử chỉ báo đúng ở thị trường yếu (2011/2016/2018/2022 — giá thấp hơn
                sau 6 tháng 70–100% số lần) và sai 98–100% trong các năm bull (2010/2024/2025).
                Không ai biết trước đang ở loại thị trường nào — bán theo kế hoạch kỳ hạn của bạn.
              </div>
            )}
            {preset && !isBuyZone && (
              <div className="verdict-note muted">
                Preset chỉ kiểm chứng tín hiệu MUA. Tín hiệu chỉ xuất hiện vài đợt mỗi năm —
                im lặng là bình thường. Bán: theo kế hoạch kỳ hạn của bạn hoặc khi chênh VN
                vượt vạch đỏ p80 ở biểu đồ bên dưới.
              </div>
            )}
            {highConf && (
              <div className="verdict-note">
                Lịch sử ở kỳ 3 tháng, khi composite báo MUA <b>VÀ</b> giá ở vùng đáy: đúng{" "}
                <b>{HIGH_CONF_3M_EVIDENCE.trainFav}%</b> (2009–2018, n={HIGH_CONF_3M_EVIDENCE.trainN}) /{" "}
                <b>{HIGH_CONF_3M_EVIDENCE.testFav}%</b> (2019–2026, n={HIGH_CONF_3M_EVIDENCE.testN}); toàn giai đoạn{" "}
                {HIGH_CONF_3M_EVIDENCE.fullFav}% (n={HIGH_CONF_3M_EVIDENCE.fullN}, CI block-bootstrap{" "}
                {HIGH_CONF_3M_EVIDENCE.fullCi[0]}–{HIGH_CONF_3M_EVIDENCE.fullCi[1]}). Lớp đáy thêm +
                {HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt}pt so với chỉ siết composite cùng cỡ mẫu.{" "}
                <i>
                  Con số 100% là ước lượng lạc quan do tín hiệu bắn chùm trong một chu kỳ nới lỏng —
                  bằng chứng vững là lợi thế giai đoạn 2009–2018.
                </i>
              </div>
            )}
          </>
        }
      />

      {/* ── GIÁ: 4 ô chính, mở sẵn ── */}
      <section className="prices">
        <div className="price-item">
          <span>SJC mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.sjcBuy)} / {fmtMoney(analysis.prices.sjcSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Nhẫn mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.ringBuy)} / {fmtMoney(analysis.prices.ringSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Thế giới quy đổi</span>
          <b>{fmtMoney(analysis.prices.worldVndPerLuong)}/lượng</b>
        </div>
        <div className="price-item">
          <span>Chênh VN−TG</span>
          <b>
            {fmtNum(analysis.prices.premiumPct)}% ({fmtMoney(analysis.prices.premiumVnd)})
          </b>
        </div>
      </section>

      {/* ── FAB + bottom sheet: preset + trọng số gom 1 chỗ ── */}
      <button
        className="fab"
        onClick={() => setSheetOpen(true)}
        aria-label="Mở thiết lập preset và trọng số"
        hidden={sheetOpen}
      >
        ⚙ {fabLabel(preset, customized)}
      </button>
      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        criteria={analysis.criteria}
        weights={weights}
        preset={preset}
        customized={customized}
        health={health}
        composite={composite}
        zone={zone}
        verdictLabel={verdictLabel}
        applyPreset={applyPreset}
        setWeight={setWeight}
      />

      {/* ── ACCORDION 1: Chi tiết điểm số (gauge + kiểm chứng + giá phụ + freshness) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chi tiết điểm số</span>
            <span className="acc-sum-meta">thước đo · kiểm chứng · giá phụ</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <div className="gauge">
            <div className="gauge-track">
              <div className="gauge-zero" />
              <div
                className="gauge-needle"
                style={{ left: `${((composite + 100) / 200) * 100}%` }}
              />
            </div>
            <div className="gauge-scale">
              <span>−100 bán</span>
              <span>0</span>
              <span>mua +100</span>
            </div>
          </div>
          {preset ? (
            <div className="verdict-bt">
              Kiểm chứng preset ({preset.horizonDays === 21 ? "1 tháng" : preset.horizonDays === 63 ? "3 tháng" : "6 tháng"}):
              tín hiệu mua đúng <b>{fmtNum(preset.evidence.trainFav)}%</b> giai đoạn 2009–2018 (n={preset.evidence.trainN})
              và <b>{fmtNum(preset.evidence.testFav)}%</b> giai đoạn 2019–2026 (n={preset.evidence.testN}),
              so với mua ngày bất kỳ {fmtNum(preset.evidence.trainBaseline)}% / {fmtNum(preset.evidence.testBaseline)}%.
              {presetHealth?.testFavCi95 && (
                <>
                  {" "}Khoảng tin cậy 95% (bootstrap, đã tính tín hiệu bắn chùm):{" "}
                  <b>
                    {fmtNum(presetHealth.testFavCi95[0])}–{fmtNum(presetHealth.testFavCi95[1])}%
                  </b>
                  .
                </>
              )}
            </div>
          ) : bt63 && bt63.pctFavorable !== null ? (
            <div className="verdict-bt">
              Kiểm chứng lịch sử: tín hiệu &quot;{ZONE_LABELS[zone]}&quot; xuất hiện{" "}
              <b>{bt63.count}</b> lần, <b>{fmtNum(bt63.pctFavorable)}%</b> diễn biến thuận chiều
              sau 3 tháng (trung vị {bt63.medianReturnPct! >= 0 ? "+" : ""}
              {fmtNum(bt63.medianReturnPct)}%).
            </div>
          ) : (
            <div className="verdict-bt muted">
              Vùng trung lập — không có khuyến nghị hành động. Chờ tín hiệu rõ hơn.
            </div>
          )}
          <div className="acc-prices">
            <div className="price-item">
              <span>XAU/USD</span>
              <b>${fmtNum(analysis.prices.xauUsd, 0)}</b>
            </div>
            <div className="price-item">
              <span>USD/VND</span>
              <b>{fmtNum(analysis.prices.usdVnd, 0)}</b>
            </div>
          </div>
          <div className="freshness">
            {mounted ? (
              <>
                <div>Bây giờ: {clock} (giờ VN)</div>
                {st ? (
                  <div className="freshness-sources">
                    Số liệu thế giới (phiên gần nhất):{" "}
                    {worldAge ?? "không có dữ liệu"}
                    {" · "}
                    Giá SJC: ngày {vnDateLabel}
                    {vnGoldAge ? ` (${vnGoldAge})` : ""}
                  </div>
                ) : (
                  <div className="freshness-sources">Cập nhật: {freshnessFallback} (giờ VN)</div>
                )}
              </>
            ) : (
              <div className="freshness-sources">Cập nhật: {freshnessFallback} (giờ VN)</div>
            )}
            {mounted && isGoldMarketClosed(nowMs) && (
              <div className="freshness-note muted">
                Thị trường vàng thế giới nghỉ cuối tuần — đây là phiên gần nhất, không phải dữ liệu cũ.
              </div>
            )}
          </div>
        </div>
      </details>

      {/* ── ACCORDION 2: 4 nhóm tiêu chí ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">4 nhóm tiêu chí</span>
            <span className="acc-sum-meta">kỹ thuật · chênh VN · vĩ mô · thống kê</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          {analysis.criteria.map((c: CriterionResult) => (
            <section key={c.key} className="card">
              <div className="card-head">
                <h2>{c.label}</h2>
                <div className="card-score">
                  {scoreChip(Math.round(c.score * 10) / 10)}
                  <span className="muted"> trọng số {Math.round(weights[c.key] * 100)}%</span>
                </div>
              </div>
              {c.provisional && (
                <div className="banner info small">
                  Đang dùng ngưỡng tham chiếu — dữ liệu chênh lệch tự thu thập mới{" "}
                  {analysis.vnHistoryDays} ngày, cần ≥ 90 ngày để so theo lịch sử thật.
                </div>
              )}
              <ul className="signals">
                {c.signals.map((s) => (
                  <li key={s.id} className={s.available ? "" : "muted"}>
                    {scoreChip(s.score)}
                    <div>
                      <div className="sig-label">{s.label}</div>
                      <div className="sig-expl">{s.explanation}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>

      {/* ── ACCORDION 3: Kiểm chứng lịch sử (backtest) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Kiểm chứng lịch sử</span>
            <span className="acc-sum-meta">backtest đa kỳ hạn</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <p className="muted small">
            {backtest.note} Giai đoạn {backtest.fromDate} → {backtest.toDate},{" "}
            {backtest.observations.toLocaleString("vi-VN")} quan sát.
          </p>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Tín hiệu</th>
                  <th>Kỳ hạn</th>
                  <th>Số lần</th>
                  <th>% thuận chiều</th>
                  <th>Trung vị</th>
                </tr>
              </thead>
              <tbody>
                {backtest.buckets
                  .filter((b) => b.count > 0)
                  .map((b) => (
                    <tr
                      key={`${b.zone}-${b.horizonDays}`}
                      className={b.zone === zone ? "hl" : ""}
                    >
                      <td className={zoneClass(b.zone)}>{ZONE_LABELS[b.zone]}</td>
                      <td>{b.horizonDays === 21 ? "1 tháng" : b.horizonDays === 63 ? "3 tháng" : "6 tháng"}</td>
                      <td>{b.count}</td>
                      <td>{b.pctFavorable === null ? "—" : `${fmtNum(b.pctFavorable)}%`}</td>
                      <td>
                        {b.medianReturnPct === null
                          ? "—"
                          : `${b.medianReturnPct >= 0 ? "+" : ""}${fmtNum(b.medianReturnPct)}%`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {/* ── ACCORDION 4: Chênh lệch VN−Thế giới ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chênh lệch VN−Thế giới</span>
            <span className="acc-sum-meta">biểu đồ + vạch p80</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <PremiumChart analysis={analysis} />
        </div>
      </details>

      {/* ── ACCORDION 5: Săn đáy ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Săn đáy</span>
            <span className="acc-sum-meta">gần đáy chưa? · bắt nhịp rơi</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <BottomGauges bottom={bottom} crashMode={bottomCrashMode} />
        </div>
      </details>

      {/* ── ACCORDION: Vùng tích lũy (DCA) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Vùng tích lũy (DCA)</span>
            <span className="acc-sum-meta">tích sản dài hạn · 2–3 năm</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <BearDcaCard bearDca={bearDca} health={bearDcaHealth} />
        </div>
      </details>

      {/* ── ACCORDION: Triển vọng 1/3/6 tháng tới (rủi ro & kết cục) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Triển vọng 1/3/6 tháng tới</span>
            <span className="acc-sum-meta">rủi ro &amp; kết cục lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <BearDownsideCard bd={bearDownside} timeline={timeline} />
        </div>
      </details>

      {/* ── ACCORDION 6: Máy thời gian ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Máy thời gian</span>
            <span className="acc-sum-meta">tua lại lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <TimeMachine timeline={timeline} weights={weights} preset={preset} fusionDegraded={fusionDegraded} />
        </div>
      </details>

      <footer className="disclaimer">
        Công cụ hỗ trợ quyết định dựa trên thống kê quá khứ — không phải khuyến nghị đầu tư,
        không đảm bảo kết quả tương lai. Quyết định và rủi ro thuộc về bạn.
        <div className="build-info">{formatBuildInfo()}</div>
      </footer>
    </main>
  );
}
