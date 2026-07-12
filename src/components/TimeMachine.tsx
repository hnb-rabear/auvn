"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CRITERION_LABELS,
  ZONE_LABELS,
  type CriterionKey,
  type Preset,
  type Timeline,
  type VnGoldEntry,
  type Zone,
} from "@/lib/types";
import { consensusLabel } from "@/lib/consensus";
import { HIGH_CONF_3M_EVIDENCE } from "@/lib/fusion";
import { bottomPctClass } from "@/lib/bottom";
import ActionGuidance from "./ActionGuidance";
import { centerWindow } from "@/lib/brush";
import { MIN_SPAN, POINTS_PER_MONTH, buildGeom, sjcUsdMap } from "@/lib/price-chart";
import { idxsAtOrAbove, indexOnOrAfter, indexOnOrBefore } from "@/lib/timeline";
import { createAsOfEngine, verdictFor, DCA_PHASE_LABEL } from "@/lib/as-of";
import PanZoomChart from "./PanZoomChart";

const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}

const HORIZON_LABELS: Record<"21" | "63" | "126", string> = {
  "21": "1 tháng",
  "63": "3 tháng",
  "126": "6 tháng",
};

/** map SJC rỗng khi toggle tắt — hằng module để geom memo không đổi tham chiếu mỗi render */
const EMPTY_SJC = new Map<string, number>();

export default function TimeMachine({
  timeline,
  vnRows,
  weights,
  preset,
  consensusMode,
  fusionDegraded,
}: {
  timeline: Timeline;
  /** giá VN — vẽ đường SJC quy đổi $ khi bật toggle trong ⚙ */
  vnRows: VnGoldEntry[];
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  /** chế độ Toàn cảnh (không preset, không tùy chỉnh): chấm theo đồng thuận k/3
   *  preset — PHẢI cùng trục với verdict live của Dashboard (bài học ×0.25 vs ×1.0) */
  consensusMode: boolean;
  /** monitor báo tầng độ-tin-cao đang thoái hóa ⇒ ẩn tag "đã kiểm chứng" mọi nơi */
  fusionDegraded: boolean;
}) {
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  /** nút preset đang active: số tháng | null = "Tất cả" | "custom" = đã kéo brush */
  const [zoomMonths, setZoomMonths] = useState<number | null | "custom">(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState(points.length);
  /** hiện vùng bán (tham khảo) trên dòng thời gian */
  const [showSell, setShowSell] = useState(false);
  /** lớp khám phá: highlight ngày có composite >= ngưỡng người dùng tự chọn.
   * null = chưa kéo, bám theo ngưỡng chuẩn của chế độ đang chọn. */
  const [showExp, setShowExp] = useState(false);
  const [expThr, setExpThr] = useState<number | null>(null);
  const [showBottomStart, setShowBottomStart] = useState(false);
  const [showGear, setShowGear] = useState(false);
  /** hiện đường SJC quy đổi $ (toggle ⚙, mặc định tắt — chart vốn nhiều marker) */
  const [showSjc, setShowSjc] = useState(false);
  const p = points[idx];

  const span = Math.min(points.length, Math.max(Math.min(MIN_SPAN, points.length), viewSpan));
  const start = Math.max(0, Math.min(viewStart, points.length - span));
  const end = start + span;

  const buyThr = preset?.buyThreshold ?? 40;
  const effThr = expThr ?? buyThr;
  // Lõi as-of dùng chung cho chart + card + preset-explorer (tách src/lib/as-of.ts,
  // 2026-07-10) — v4: chế độ preset chấm bằng presetComposites, chế độ đồng thuận
  // chấm bằng k/3 preset (cùng trục với verdict live).
  const eng = useMemo(
    () => createAsOfEngine(points, { preset, weights, consensusMode, fusionDegraded }),
    [points, preset, weights, consensusMode, fusionDegraded]
  );
  const comps = eng.comps;
  const buyKs = eng.buyKs;
  const signalIdxs = eng.signalIdxs;
  const sellIdxs = eng.sellIdxs;
  const dayAt = useMemo(() => eng.day(idx), [eng, idx]);
  const expIdxs = useMemo(
    () => (showExp ? idxsAtOrAbove(comps, effThr) : []),
    [showExp, comps, effThr]
  );
  const bottomStarts = showBottomStart ? eng.bottomStarts : [];
  const dates = useMemo(() => points.map((q) => q.date), [points]);
  const prevSignal = [...signalIdxs].reverse().find((i) => i < idx);
  const nextSignal = signalIdxs.find((i) => i > idx);

  const centerOn = useCallback(
    (i: number, s: number = span) => {
      const sp = Math.min(points.length, Math.max(MIN_SPAN, s));
      setViewStart(centerWindow(i, sp, points.length));
    },
    [span, points.length]
  );

  const goTo = (i: number) => {
    setIdx(i);
    if (i < start || i >= end) centerOn(i);
  };

  const applyZoom = (m: number | null) => {
    setZoomMonths(m);
    const s =
      m === null
        ? points.length
        : Math.min(points.length, Math.max(MIN_SPAN, m * POINTS_PER_MONTH));
    setViewSpan(s);
    if (m === null) setViewStart(0);
    else centerOn(idx, s);
  };

  /** Đặt cửa sổ theo khoảng index [fromIdx, toIdx] (kẹp biên, tối thiểu MIN_SPAN). */
  const applyDateRange = (fromIdx: number, toIdx: number) => {
    const lo = Math.max(0, Math.min(fromIdx, points.length - 1));
    const hi = Math.max(lo, Math.min(toIdx, points.length - 1));
    setViewStart(lo);
    setViewSpan(Math.max(MIN_SPAN, hi - lo + 1));
    setZoomMonths("custom");
  };

  const composite = dayAt.composite;
  const kDay = dayAt.kDay;
  const rawZone = dayAt.rawZone;
  const isBuy = dayAt.isBuy;
  const highConfDay = dayAt.highConf;
  const isSell = dayAt.isSell;
  // preset chỉ kiểm chứng phía mua — vùng bán chỉ hiện khi người dùng bật toggle tham khảo
  const zone: Zone = dayAt.isBuy ? dayAt.rawZone : dayAt.isSell && showSell ? dayAt.rawZone : "neutral";
  const presetH = preset ? (String(preset.horizonDays) as "21" | "63" | "126") : null;
  const dcaAt = dayAt.dca;
  // Cổng acute-crash as-of-ngày — CÙNG chính sách với live (Dashboard): khi phase Bear
  // DCA của NGÀY ĐANG XEM là "acute", prob recency dễ lạc quan giả ⇒ dùng bản không
  // trọng số. dayAt đã walk-forward nên "quá khứ = hiện tại" giữ nguyên.
  const bottomCrashDay = dayAt.crashDay;
  const histGuidance = dayAt.guidance;

  // geom dùng chung với PriceChart (buildGeom) — thay toán spark inline cũ.
  // sjcUsd chỉ tính khi toggle bật; map rỗng ⇒ buildGeom bỏ đường SJC.
  const sjcUsd = useMemo(() => (showSjc ? sjcUsdMap(vnRows) : EMPTY_SJC), [showSjc, vnRows]);
  const geom = useMemo(() => buildGeom(points, start, span, sjcUsd, 700, 200), [points, start, span, sjcUsd]);
  const hasChart = points.length >= 2;

  if (!p) return null;

  // chấm nhỏ lại khi zoom rộng để đỡ rối
  const denseDots = span > 24 * POINTS_PER_MONTH;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Xét lại lịch sử — máy thời gian</h2>
        <div className="card-score">
          <span className="muted small">
            chấm theo:{" "}
            {preset
              ? `preset ${preset.label}`
              : consensusMode
                ? "đồng thuận 3 preset (toàn cảnh)"
                : "trọng số tùy chỉnh (tiêu chí thế giới)"}
          </span>
        </div>
      </div>
      <p className="muted small">
        Kéo để trượt thời gian · chạm để chọn ngày · chụm 2 ngón (hoặc lăn chuột) để zoom. {timeline.note}
      </p>

      <div className="tm-zoom">
        {(
          [
            [1, "1 tháng", "1T"],
            [3, "3 tháng", "3T"],
            [6, "6 tháng"],
            [12, "1 năm"],
            [24, "2 năm"],
            [60, "5 năm"],
            [120, "10 năm"],
            [null, "Tất cả"],
          ] as [number | null, string, string?][]
        ).map(([m, label, short]) => (
          <button
            key={label}
            className={`iconbtn small-btn ${zoomMonths === m ? "active" : ""}`}
            onClick={() => applyZoom(m)}
          >
            {short ? (
              <>
                <span className="tm-zoom-full">{label}</span>
                <span className="tm-zoom-short">{short}</span>
              </>
            ) : (
              label
            )}
          </button>
        ))}
        <button
          className="iconbtn small-btn"
          onClick={() => setShowGear((v) => !v)}
          aria-label="Tùy chọn"
          title="Tùy chọn: vùng bán, ngưỡng thử, khoảng ngày"
        >⚙</button>
      </div>

      {showGear && (
        <div className="tm-gear">
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showSell} onChange={(e) => setShowSell(e.target.checked)} />
            Hiện vùng bán (tham khảo NGƯỜI BÁN — sai gần 100% trong năm bull; trong kỳ hạn
            bán, bán muộn tốt hơn bán ngay — docs/sell-zone.md)
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showExp} onChange={(e) => setShowExp(e.target.checked)} />
            Ngưỡng thử nghiệm
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showBottomStart} onChange={(e) => setShowBottomStart(e.target.checked)} />
            Đánh dấu khởi đầu vùng đáy
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showSjc} onChange={(e) => setShowSjc(e.target.checked)} />
            Hiện đường SJC (quy đổi $, đường xanh — chỉ vùng có dữ liệu VN)
          </label>
          {hasChart && (
            <span className="tm-daterange muted small">
              <input
                type="date"
                value={points[start].date}
                min={dates[0]}
                max={points[end - 1].date}
                onChange={(e) => e.target.value && applyDateRange(indexOnOrAfter(dates, e.target.value), end - 1)}
              />
              <span aria-hidden>→</span>
              <input
                type="date"
                value={points[end - 1].date}
                min={points[start].date}
                max={dates[dates.length - 1]}
                onChange={(e) => e.target.value && applyDateRange(start, indexOnOrBefore(dates, e.target.value))}
              />
            </span>
          )}
          <span className="muted small">
            {signalIdxs.length} ngày tín hiệu mua
            {showSell ? ` · ${sellIdxs.length} ngày vùng bán` : ""} / {points.length} ngày — chế độ này
          </span>
        </div>
      )}

      {showExp && (
        <label className="slider-row tm-exp">
          <span>
            Ngưỡng thử +{effThr} — <b>{expIdxs.length}</b> ngày đạt / {points.length} ngày
            <span className="muted small">
              {" "}
              · chỉ để khám phá — % kiểm chứng chỉ áp dụng cho ngưỡng chuẩn (+{buyThr})
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={effThr}
            onChange={(e) => setExpThr(Number(e.target.value))}
          />
        </label>
      )}

      {showBottomStart && (
        <div className="tm-exp muted small">
          ◆ Ngày oversold + vĩ mô lần đầu bật — điểm dò đáy sớm (walk-forward). Mạnh hơn trong xu hướng tăng; KHÔNG khẳng định là đáy.
        </div>
      )}

      {hasChart && (
        <PanZoomChart
          points={points}
          geom={geom}
          window={{ start, span }}
          onWindowChange={(next, gesture) => {
            setViewStart(next.start);
            setViewSpan(next.span);
            if (gesture === "zoom") setZoomMonths("custom"); // pan giữ nhãn nút đang chọn
          }}
          onSelect={setIdx}
          selectedIdx={idx}
          markers={[
            { key: "x", className: "exp", idxs: expIdxs },
            { key: "s", className: "sell", idxs: showSell ? sellIdxs : [] },
            { key: "b", className: "buy", idxs: signalIdxs },
            { key: "st", className: "start", idxs: bottomStarts },
          ]}
          height={200}
          denseDots={denseDots}
          ariaLabel="Biểu đồ giá XAU/USD — kéo để trượt, chạm để chọn ngày, chụm 2 ngón để zoom"
        >
          <button
            className="tm-fab left"
            disabled={prevSignal === undefined}
            onClick={() => prevSignal !== undefined && goTo(prevSignal)}
            aria-label="Tín hiệu mua trước"
          >◀</button>
          <button
            className="tm-fab right"
            disabled={nextSignal === undefined}
            onClick={() => nextSignal !== undefined && goTo(nextSignal)}
            aria-label="Tín hiệu mua sau"
          >▶</button>
        </PanZoomChart>
      )}

      <div className="tm-dateband">
        <span className="d">
          {fmtDate(p.date)}{idx === points.length - 1 ? " (mới nhất)" : ""} · XAU ${fmtNum(p.price, 0)}
        </span>
        <span className={`tm-zone ${zoneClass(zone)}`}>
          {zone === "sell" || zone === "strong-sell"
            ? `${ZONE_LABELS[zone]} (tham khảo người bán)`
            : consensusMode
              ? consensusLabel(kDay)
              : preset && !isBuy
                ? "CHƯA CÓ TÍN HIỆU MUA"
                : ZONE_LABELS[zone]}
          <span className="muted small">
            {" "}({consensusMode ? "radar " : ""}{composite > 0 ? "+" : ""}{fmtNum(composite)})
          </span>
          {highConfDay && <b> · đã kiểm chứng</b>}
        </span>
      </div>

      <div className="muted small">
        <b className={dcaAt.mult >= 1 ? "buy" : "sell"}>Mức mua (Vùng tích lũy):</b>{" "}
        pha {DCA_PHASE_LABEL[dcaAt.phase]} → mỗi đợt ×{dcaAt.mult}
        {p.pricePct2y != null && ` · giá percentile ${Math.round(p.pricePct2y * 100)}% (2 năm)`}
        . Cùng con số với thẻ Vùng tích lũy — góc tích sản, có thể ngược điểm-mua ngắn hạn.
      </div>

      {highConfDay && (
        <div className="muted small">
          ✓ MUA độ tin cao (3 tháng): composite báo MUA VÀ giá ở vùng đáy (RSI quá bán + vĩ mô đảo
          chiều). Lịch sử đúng {HIGH_CONF_3M_EVIDENCE.trainFav}% (2009–2018) /{" "}
          {HIGH_CONF_3M_EVIDENCE.testFav}% (2019–2026); toàn giai đoạn {HIGH_CONF_3M_EVIDENCE.fullFav}%
          (CI {HIGH_CONF_3M_EVIDENCE.fullCi[0]}–{HIGH_CONF_3M_EVIDENCE.fullCi[1]}). Con số 100%
          là lạc quan do tín hiệu bắn chùm — bằng chứng vững là giai đoạn 2009–2018.
        </div>
      )}

      {showBottomStart && bottomStarts.includes(idx) && (
        <div className="muted small">
          ◆ Điểm BẮT ĐẦU vùng đáy — oversold + vĩ mô vừa bật (dò đáy sớm, không phải đáy chắc)
        </div>
      )}

      <div className="tm-bottom">
        {(
          [
            ["Đáy chu kỳ", "≈6 tháng", dayAt.cycleProb, dayAt.cycleCi, dayAt.cycleN],
            ["Đáy sóng", "≈1 tháng", dayAt.swingProb, dayAt.swingCi, dayAt.swingN],
          ] as [string, string, number | null, [number, number] | null, number][]
        ).map(([title, sub, prob, ci, n]) => {
          const ok = prob !== null && n >= 10;
          return (
            <div key={title} className="tm-bottom-item">
              <span className="muted small">{title} <span className="muted small">{sub}</span></span>
              {ok ? (
                <span className={`bottom-gauge-pct ${bottomPctClass(prob)}`}>
                  {Math.round(prob)}%
                  {ci ? <span className="muted small"> (CI {ci[0]}–{ci[1]}%)</span> : null}
                </span>
              ) : (
                <span className="muted small">Chưa đủ dữ liệu kiểm chứng</span>
              )}
            </div>
          );
        })}
      </div>
      {bottomCrashDay && (p.cycleProb ?? p.swingProb) != null && (
        <div className="muted small">⚠ Ngày này giá đang sụp cấp tính — hiện ước lượng săn đáy thận trọng (toàn lịch sử).</div>
      )}

      <ActionGuidance guidance={histGuidance} />

      <div className="tm-results">
        {(["21", "63", "126"] as const).map((h) => {
          const ret = p.returns[h];
          const v = verdictFor(zone, ret, h);
          const isPresetHorizon = presetH === h;
          return (
            <span key={h} className={`r ${isPresetHorizon ? "hl" : ""}`}>
              Sau {HORIZON_LABELS[h]}{isPresetHorizon ? " (preset)" : ""}:{" "}
              <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
                {ret === null ? "chưa có" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
              </b>
              {v === "right" && <span className="tm-verdict buy"> ✓</span>}
              {v === "wrong" && <span className="tm-verdict sell"> ✗</span>}
            </span>
          );
        })}
      </div>

      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chi tiết điểm số</span>
            <span className="acc-sum-meta">4 nhóm tiêu chí · ghi chú lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <div className="tm-scores">
            {/* chỉ 4 nhóm tiêu chí — key sub-signal vĩ mô (dxy/fed/yield10y, v4) không có
                nhãn nhóm riêng, chi tiết của chúng nằm trong card phân tích vĩ mô */}
            {(Object.keys(p.scores) as CriterionKey[])
              .filter((k) => CRITERION_LABELS[k] !== undefined)
              .map((k) => (
                <span key={k} className="tm-score">
                  {CRITERION_LABELS[k].split(" (")[0]}:{" "}
                  <b className={p.scores[k]! > 0 ? "buy" : p.scores[k]! < 0 ? "sell" : "neutral"}>
                    {p.scores[k]! > 0 ? "+" : ""}{fmtNum(p.scores[k]!, 2)}
                  </b>
                </span>
              ))}
          </div>
          <p className="muted small">
            Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
            chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
            <b> Gợi ý hành động</b> đầu trang.
          </p>
        </div>
      </details>
    </section>
  );
}
