"use client";

import { useEffect } from "react";
import {
  PRESETS,
  type Preset,
  type Zone,
  type CriterionKey,
  type CriterionResult,
  type PresetHealthFile,
} from "@/lib/types";
import { zoneClass } from "@/lib/settings";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  criteria: CriterionResult[];
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  customized: boolean;
  health: PresetHealthFile;
  composite: number;
  zone: Zone;
  verdictLabel: string;
  applyPreset: (id: string | null) => void;
  setWeight: (k: CriterionKey, v: number) => void;
}

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function SettingsSheet({
  open,
  onClose,
  criteria,
  weights,
  preset,
  customized,
  health,
  composite,
  zone,
  verdictLabel,
  applyPreset,
  setWeight,
}: SettingsSheetProps) {
  // Khóa cuộn body + đóng bằng Esc khi sheet mở.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`sheet-overlay ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Thiết lập preset và trọng số"
        aria-hidden={!open}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <strong>Thiết lập</strong>
          <button className="sheet-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        {/* Dải verdict ghim — cập nhật realtime theo prop từ Dashboard */}
        <div className="sheet-verdict">
          <span className={`v-zone ${zoneClass(zone)}`}>{verdictLabel}</span>
          <span className="muted">điểm {fmt(composite)}</span>
        </div>

        {/* Chip preset */}
        <div className="preset-row">
          <button
            className={`iconbtn ${!preset && !customized ? "active" : ""}`}
            onClick={() => applyPreset(null)}
          >
            Toàn cảnh
          </button>
          {PRESETS.map((p) => {
            const hStatus = health.items.find((i) => i.presetId === p.id)?.status;
            return (
              <button
                key={p.id}
                className={`iconbtn ${preset?.id === p.id ? "active" : ""}`}
                onClick={() => applyPreset(p.id)}
                title={`Đúng ${p.evidence.trainFav}% (2009–2018) / ${p.evidence.testFav}% (2019–2026)`}
              >
                {hStatus === "degraded" ? "⚠ " : ""}
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Slider trọng số */}
        <div className="settings">
          {criteria.map((c) => (
            <label key={c.key} className="slider-row">
              <span>
                {c.label} — {Math.round(weights[c.key] * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={50}
                value={Math.round(weights[c.key] * 100)}
                onChange={(e) => setWeight(c.key, Number(e.target.value) / 100)}
              />
            </label>
          ))}
        </div>

        {/* Giải thích thu gọn — sheet mặc định ngắn, không cuộn */}
        <details className="acc">
          <summary className="acc-sum">
            <span className="acc-sum-text">
              <span className="acc-sum-title">Giải thích</span>
            </span>
            <span className="acc-chev">▸</span>
          </summary>
          <div className="acc-body">
            <p className="muted small">
              <b>Toàn cảnh</b> = bảng đồng thuận: verdict chính là &quot;k/3 preset kỳ hạn
              đang báo MUA&quot; (tái dùng 3 cò súng đã kiểm chứng — không phải composite
              riêng; cấu hình mặc định cũ bắn 0 tín hiệu mua suốt 2019–2026 nên chỉ còn làm
              radar ngữ cảnh + cảnh báo gió ngược). <b>Preset</b> = cò súng MUA theo kỳ hạn,
              tuyển bằng grid search 17 năm, thắng baseline ở cả 2 giai đoạn độc lập — chọn
              khi bạn muốn nhìn theo đúng một kỳ hạn. Chi tiết: docs/presets.md.
            </p>
            <p className="muted">
              Điểm tổng hợp tính lại ngay theo trọng số bạn chọn. Lưu trên máy bạn. Kéo
              slider sẽ thoát chế độ preset. Lưu ý: bảng % kiểm chứng tính theo trọng số mặc định.
            </p>
          </div>
        </details>
      </div>
    </>
  );
}
