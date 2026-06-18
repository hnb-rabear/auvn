# Tầng "MUA độ tin cao" 3 tháng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bồi bằng chứng đã kiểm chứng (composite-buy ∧ vùng đáy) vào cấp guidance `strong` sẵn có, CHỈ khi đang ở preset 3 tháng và đúng điều kiện đã backtest (`cycleBin==3`), kèm CI + cảnh báo trung thực và giám sát thoái hóa.

**Architecture:** Một cờ DẪN XUẤT thuần hàm (`highConfidenceBuy3m`) từ các đại lượng đã có ở `Dashboard` (preset, isBuyZone, `bottom.cycle.bin`, cycleVerified). KHÔNG sửa `compositeScore`, KHÔNG sửa engine Bottom Hunter, KHÔNG thêm nhãn verdict mới — chỉ thêm tag + khối evidence vào hero verdict khi cờ bật và monitor không báo degraded.

**Tech Stack:** Next.js 15 (static export, React), TypeScript, vitest, tsx scripts. Dữ liệu precomputed trong `public/data/*.json`.

## Global Constraints

- UI tiếng Việt; chuỗi giải thích là tiếng Việt cho người dùng, không phải mã.
- KHÔNG sửa composite hay engine Bottom Hunter (CLAUDE.md: "Bottom Hunter does NOT touch the buy/sell composite"). Tầng mới chỉ là view dẫn xuất.
- Số liệu evidence trong code phải KHỚP `docs/fusion.md` (cùng quy ước presets.md ↔ PRESETS).
- `HIGH_CONFIDENCE_BIN = 3` ứng `BOTTOM_CONFIG.cycle.binEdges = [-40,0,40]` (3 ranh giới ⇒ bin cao = 3). Đổi binEdges thì đổi hằng — khóa bằng test.
- Chạy trên free tier; không thêm dịch vụ trả phí, không fetch mới (dùng `cycleBin` đã có trong `timeline.json` / `bottom.json`).
- Bằng chứng nguồn: `scripts/fusion-study.ts` (đã commit). Chỉ kỳ 3m GO robust; 1m/6m và biến thể A/C đã LOẠI — KHÔNG wire.

---

### Task 1: Lõi fusion thuần (`src/lib/fusion.ts`)

**Files:**
- Create: `src/lib/fusion.ts`
- Test: `src/lib/fusion.test.ts`, `src/lib/fusion.evidence.test.ts`

**Interfaces:**
- Consumes: `BOTTOM_CONFIG`, `PRESETS`, `Timeline`, `TimelinePoint` từ `src/lib/types`.
- Produces:
  - `HIGH_CONFIDENCE_BIN: number` (= 3)
  - `interface HighConfEvidence { trainFav; trainN; testFav; testN; sparseFav; sparseN; sparseCi: [number,number]; orthogonalTrainPt }` (tất cả `number`)
  - `HIGH_CONF_3M_EVIDENCE: HighConfEvidence`
  - `highConfidenceBuy3m(presetId: string | null, isBuyZone: boolean, cycleBin: number, cycleVerified: boolean): boolean`

- [ ] **Step 1: Viết test thất bại cho `highConfidenceBuy3m` + hằng số**

Tạo `src/lib/fusion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { highConfidenceBuy3m, HIGH_CONFIDENCE_BIN } from "./fusion";
import { BOTTOM_CONFIG } from "./types";

describe("highConfidenceBuy3m", () => {
  it("bật khi 3m + vùng mua + cycleBin==3 + verified", () => {
    expect(highConfidenceBuy3m("3m", true, 3, true)).toBe(true);
  });
  it("tắt ở preset khác", () => {
    expect(highConfidenceBuy3m("1m", true, 3, true)).toBe(false);
    expect(highConfidenceBuy3m("6m", true, 3, true)).toBe(false);
    expect(highConfidenceBuy3m(null, true, 3, true)).toBe(false);
  });
  it("tắt khi không phải vùng mua", () => {
    expect(highConfidenceBuy3m("3m", false, 3, true)).toBe(false);
  });
  it("tắt khi cycleBin < 3", () => {
    expect(highConfidenceBuy3m("3m", true, 2, true)).toBe(false);
  });
  it("tắt khi chưa verified", () => {
    expect(highConfidenceBuy3m("3m", true, 3, false)).toBe(false);
  });
});

describe("HIGH_CONFIDENCE_BIN", () => {
  it("khớp số bin cao của BOTTOM_CONFIG.cycle (k ranh giới ⇒ bin cao = k)", () => {
    expect(HIGH_CONFIDENCE_BIN).toBe(BOTTOM_CONFIG.cycle.binEdges.length);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/lib/fusion.test.ts`
Expected: FAIL — `Cannot find module './fusion'`.

- [ ] **Step 3: Viết `src/lib/fusion.ts`**

```ts
/**
 * Tầng "MUA độ tin cao" — cờ DẪN XUẤT từ composite (điểm mua) ∧ Bottom Hunter
 * (vùng đáy). KHÔNG sửa composite/engine đáy. Chỉ kỳ 3 tháng được kiểm chứng
 * robust (xem docs/fusion.md, scripts/fusion-study.ts).
 */

/** Bin cao của bottomScore = tín hiệu "vùng đáy" đã validated. Khớp
 *  BOTTOM_CONFIG.cycle.binEdges [-40,0,40] (3 ranh giới ⇒ bin 3 = score ≥ 40). */
export const HIGH_CONFIDENCE_BIN = 3;

/** Số liệu kiểm chứng B (composite-buy ∧ cycleBin==3) ở kỳ 3 tháng. Phải khớp
 *  docs/fusion.md và đầu ra scripts/fusion-study.ts. Khóa bằng fusion.evidence.test.ts. */
export interface HighConfEvidence {
  trainFav: number;
  trainN: number;
  testFav: number;
  testN: number;
  /** lưới thưa STEP=3 (mẫu decorrelated) */
  sparseFav: number;
  sparseN: number;
  sparseCi: [number, number];
  /** placebo đồng-n train: B vượt composite-top-n cùng cỡ mẫu (pt) — đo "thông tin trực giao" */
  orthogonalTrainPt: number;
}

export const HIGH_CONF_3M_EVIDENCE: HighConfEvidence = {
  trainFav: 92.8,
  trainN: 69,
  testFav: 100.0,
  testN: 89,
  sparseFav: 96.3,
  sparseN: 54,
  sparseCi: [88.9, 100],
  orthogonalTrainPt: 10.1,
};

/**
 * true khi: đang ở preset 3m + vùng MUA + vùng đáy (cycleBin==3) + tầng đáy đã
 * verified. Đây là tập con của guidance level "strong" — chỉ dùng để quyết định
 * có HIỂN THỊ khối evidence/CI hay không, không đổi nhãn/tone.
 */
export function highConfidenceBuy3m(
  presetId: string | null,
  isBuyZone: boolean,
  cycleBin: number,
  cycleVerified: boolean
): boolean {
  return presetId === "3m" && isBuyZone && cycleBin === HIGH_CONFIDENCE_BIN && cycleVerified;
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/lib/fusion.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Viết test hồi quy bằng chứng (khóa evidence ↔ dữ liệu)**

Tạo `src/lib/fusion.evidence.test.ts` — recompute B-3m trực tiếp từ `timeline.json` thật, đảm bảo hằng không lệch dữ liệu:

```ts
import { describe, it, expect } from "vitest";
import tlJson from "../../public/data/timeline.json";
import { HIGH_CONF_3M_EVIDENCE, HIGH_CONFIDENCE_BIN } from "./fusion";
import { PRESETS, type Timeline, type TimelinePoint } from "./types";

const tl = tlJson as unknown as Timeline;
const preset = PRESETS.find((p) => p.id === "3m")!;

function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0, tw = 0;
  for (const [k, v] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (v as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}
const pts = tl.points.filter((p) => p.returns["63"] !== null && p.cycleBin !== undefined);
const B = (seg: TimelinePoint[]) =>
  seg.filter((p) => composite(p, preset.weights) >= preset.buyThreshold && p.cycleBin === HIGH_CONFIDENCE_BIN);
const favPct = (seg: TimelinePoint[]) => {
  const r = seg.map((p) => p.returns["63"] as number);
  return (r.filter((x) => x > 0).length / r.length) * 100;
};

describe("HIGH_CONF_3M_EVIDENCE khớp timeline.json", () => {
  it("train (2009–2018)", () => {
    const tr = B(pts.filter((p) => p.date < "2019-01-01"));
    expect(tr.length).toBe(HIGH_CONF_3M_EVIDENCE.trainN);
    expect(favPct(tr)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.trainFav, 0);
  });
  it("test (2019–2026)", () => {
    const te = B(pts.filter((p) => p.date >= "2019-01-01"));
    expect(te.length).toBe(HIGH_CONF_3M_EVIDENCE.testN);
    expect(favPct(te)).toBeCloseTo(HIGH_CONF_3M_EVIDENCE.testFav, 0);
  });
});
```

- [ ] **Step 6: Chạy test để xác nhận PASS**

Run: `npx vitest run src/lib/fusion.evidence.test.ts`
Expected: PASS (2 test). Nếu FAIL do dữ liệu trôi: cập nhật `HIGH_CONF_3M_EVIDENCE` + `docs/fusion.md` cho khớp (KHÔNG nới tolerance).

- [ ] **Step 7: Commit**

```bash
git add src/lib/fusion.ts src/lib/fusion.test.ts src/lib/fusion.evidence.test.ts
git commit -m "feat(fusion): lõi highConfidenceBuy3m + evidence kỳ 3 tháng"
```

---

### Task 2: Giám sát thoái hóa (`scripts/monitor-fusion.ts` + types + dữ liệu)

**Files:**
- Modify: `src/lib/types.ts` (thêm `FusionHealth`, `FusionHealthFile`)
- Create: `scripts/monitor-fusion.ts`
- Create: `public/data/fusion-health.json` (sinh bằng script, commit để build có dữ liệu)
- Modify: `.github/workflows/update-and-deploy.yml` (thêm bước chạy monitor-fusion)

**Interfaces:**
- Consumes: `composite`, `stats`, `blockBootstrapCi`, `SPLIT_DATE`, `MIN_SIGNALS`, `H` từ `./study-lib`; `HIGH_CONFIDENCE_BIN` từ `../src/lib/fusion`; `PRESETS`, `Timeline`, `TimelinePoint` từ `../src/lib/types`.
- Produces:
  - `interface FusionHealth { presetId: "3m"; bTrainFav: number|null; bTestFav: number|null; compTrainFav: number|null; compTestFav: number|null; bTestN: number; bTestCi95: [number,number]|null; orthoTrainPt: number|null; status: "ok"|"degraded"|"insufficient" }`
  - `interface FusionHealthFile { generatedAt: string; item: FusionHealth }`
  - File `public/data/fusion-health.json` đúng shape `FusionHealthFile`.

- [ ] **Step 1: Thêm type vào `src/lib/types.ts`**

Chèn ngay sau khối `PresetHealthFile` (sau dòng `export interface PresetHealthFile { ... }`):

```ts
/** Sức khỏe tầng "MUA độ tin cao" 3m — tính lại mỗi cron bởi scripts/monitor-fusion.ts.
 *  degraded khi B (composite∧đáy) KHÔNG còn vượt composite ở cả 2 giai đoạn,
 *  hoặc placebo đồng-n train ≤ 0 (đáy hết thông tin trực giao). */
export interface FusionHealth {
  presetId: "3m";
  bTrainFav: number | null;
  bTestFav: number | null;
  compTrainFav: number | null;
  compTestFav: number | null;
  bTestN: number;
  bTestCi95: [number, number] | null;
  /** placebo đồng-n train: B − composite-top-n (pt) */
  orthoTrainPt: number | null;
  status: "ok" | "degraded" | "insufficient";
}

export interface FusionHealthFile {
  generatedAt: string;
  item: FusionHealth;
}
```

- [ ] **Step 2: Viết `scripts/monitor-fusion.ts`**

```ts
/**
 * Giám sát thoái hóa tầng "MUA độ tin cao" 3m: mỗi cron tính lại B (composite-buy
 * ∧ cycleBin==3) trên timeline mới nhất, so với composite-gốc ở cả 2 giai đoạn +
 * placebo đồng-n train. status=degraded khi B không còn vượt composite cả 2 giai
 * đoạn HOẶC placebo train ≤ 0. Ghi public/data/fusion-health.json (UI đọc file này).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRESETS,
  type FusionHealth,
  type FusionHealthFile,
  type Timeline,
  type TimelinePoint,
} from "../src/lib/types";
import { composite, stats, blockBootstrapCi, SPLIT_DATE, MIN_SIGNALS, type H } from "./study-lib";
import { HIGH_CONFIDENCE_BIN } from "../src/lib/fusion";

const DATA_DIR = join(process.cwd(), "public", "data");
const STEP = 3;

function favOf(pts: TimelinePoint[], h: H): { n: number; fav: number } {
  const s = stats(pts.map((p) => p.returns[h] as number));
  return { n: s.n, fav: s.fav };
}

function main() {
  const tl: Timeline = JSON.parse(readFileSync(join(DATA_DIR, "timeline.json"), "utf8"));
  const preset = PRESETS.find((p) => p.id === "3m")!;
  const h = String(preset.horizonDays) as H; // "63"
  const pts = tl.points.filter((p) => p.returns[h] !== null && p.cycleBin !== undefined);

  const comp = (p: TimelinePoint) => composite(p, preset.weights) >= preset.buyThreshold;
  const bot = (p: TimelinePoint) => p.cycleBin === HIGH_CONFIDENCE_BIN;

  const train = pts.filter((p) => p.date < SPLIT_DATE);
  const test = pts.filter((p) => p.date >= SPLIT_DATE);

  const bTrain = favOf(train.filter((p) => comp(p) && bot(p)), h);
  const bTest = favOf(test.filter((p) => comp(p) && bot(p)), h);
  const cTrain = favOf(train.filter(comp), h);
  const cTest = favOf(test.filter(comp), h);

  // placebo đồng-n train: composite-buy top-n_B theo điểm giảm dần
  const compTrainSorted = train
    .filter(comp)
    .sort((a, b) => composite(b, preset.weights) - composite(a, preset.weights));
  const topN = compTrainSorted.slice(0, bTrain.n);
  const orthoTrainPt =
    bTrain.n >= MIN_SIGNALS ? Math.round((bTrain.fav - favOf(topN, h).fav) * 1000) / 10 : null;

  const ci = blockBootstrapCi(
    test.filter((p) => comp(p) && bot(p)).map((p) => p.returns[h] as number),
    Math.ceil(preset.horizonDays / STEP)
  );

  const enough = bTrain.n >= MIN_SIGNALS && bTest.n >= MIN_SIGNALS;
  let status: FusionHealth["status"];
  if (!enough) status = "insufficient";
  else if (!(bTrain.fav > cTrain.fav && bTest.fav > cTest.fav) || (orthoTrainPt !== null && orthoTrainPt <= 0))
    status = "degraded";
  else status = "ok";

  const r1 = (x: number) => Math.round(x * 1000) / 10;
  const item: FusionHealth = {
    presetId: "3m",
    bTrainFav: enough ? r1(bTrain.fav) : null,
    bTestFav: enough ? r1(bTest.fav) : null,
    compTrainFav: r1(cTrain.fav),
    compTestFav: r1(cTest.fav),
    bTestN: bTest.n,
    bTestCi95: ci,
    orthoTrainPt,
    status,
  };
  const out: FusionHealthFile = { generatedAt: new Date().toISOString(), item };
  writeFileSync(join(DATA_DIR, "fusion-health.json"), JSON.stringify(out, null, 1));
  console.log(
    `fusion 3m: status=${status} | B ${item.bTrainFav}%/${item.bTestFav}% vs comp ${item.compTrainFav}%/${item.compTestFav}% | ` +
      `ortho train ${orthoTrainPt ?? "—"}pt | CI ${ci ? ci[0] + ".." + ci[1] + "%" : "—"}`
  );
}

main();
```

- [ ] **Step 3: Sinh `fusion-health.json` và kiểm output**

Run: `npx tsx scripts/monitor-fusion.ts`
Expected: in `fusion 3m: status=ok | B 92.8%/100% vs comp 81.6%/95.3% | ortho train 10.1pt | CI 88.9..100%` (xấp xỉ); tạo `public/data/fusion-health.json`.

- [ ] **Step 4: Thêm bước monitor vào workflow**

Trong `.github/workflows/update-and-deploy.yml`, ngay sau bước "Monitor preset health" (sau dòng `run: npx tsx scripts/monitor-presets.ts`), chèn:

```yaml
      - name: Monitor fusion health
        run: npx tsx scripts/monitor-fusion.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts scripts/monitor-fusion.ts public/data/fusion-health.json .github/workflows/update-and-deploy.yml
git commit -m "feat(fusion): monitor thoái hóa B-3m + fusion-health.json"
```

---

### Task 3: Hiển thị evidence trong hero verdict (`page.tsx` + `Dashboard.tsx`)

**Files:**
- Modify: `src/app/page.tsx` (nạp `fusion-health.json`, truyền prop)
- Modify: `src/components/Dashboard.tsx` (nhận prop, tính `highConf`, render tag + khối evidence)

**Interfaces:**
- Consumes: `highConfidenceBuy3m`, `HIGH_CONF_3M_EVIDENCE` từ `@/lib/fusion`; `FusionHealthFile` từ `@/lib/types`; biến sẵn có trong Dashboard: `preset`, `isBuyZone`, `bottom.cycle.bin`, `cycleVerified`, `verdictLabel`, `heroMeta`.
- Produces: prop mới `fusionHealth: FusionHealthFile` trên `Dashboard`.

- [ ] **Step 1: Nạp dữ liệu trong `src/app/page.tsx`**

Thêm import (sau dòng `import healthJson ...`):

```ts
import fusionHealthJson from "../../public/data/fusion-health.json";
```

Thêm vào danh sách type import:

```ts
import type { Analysis, Backtest, BottomAnalysis, FusionHealthFile, PresetHealthFile, Timeline } from "@/lib/types";
```

Trong `Home()`, thêm trước `return`:

```ts
  const fusionHealth = fusionHealthJson as unknown as FusionHealthFile;
```

Và truyền prop:

```tsx
    <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} health={health} bottom={bottom} fusionHealth={fusionHealth} />
```

- [ ] **Step 2: Khai báo prop + import trong `Dashboard.tsx`**

Thêm import (cạnh các import `@/lib/...`):

```ts
import { highConfidenceBuy3m, HIGH_CONF_3M_EVIDENCE } from "@/lib/fusion";
```

Thêm `FusionHealthFile` vào type import từ `@/lib/types` (cùng dòng đang import `type BottomAnalysis,`):

```ts
  type FusionHealthFile,
```

Trong khối destructure props của `Dashboard` (nơi có `bottom,`), thêm `fusionHealth,`. Trong interface props (nơi có `bottom: BottomAnalysis;`), thêm:

```ts
  fusionHealth: FusionHealthFile;
```

- [ ] **Step 3: Tính `highConf` (sau dòng `const swingVerified = ...`)**

```ts
  // Tầng "độ tin cao" 3m: chỉ bồi evidence khi composite-buy ∧ vùng đáy (cycleBin==3)
  // + verified, và monitor không báo thoái hóa. Tập con của guidance "strong".
  const fusionDegraded = fusionHealth.item.status === "degraded";
  const highConf =
    highConfidenceBuy3m(preset?.id ?? null, isBuyZone, bottom.cycle.bin, cycleVerified) &&
    !fusionDegraded;
```

- [ ] **Step 4: Thêm tag vào `heroMeta`**

Trong JSX của `heroMeta`, ngay sau `<b>{verdictLabel}</b>`, chèn:

```tsx
      {highConf && <span className="hc-tag"> (đã kiểm chứng — 3 tháng)</span>}
```

- [ ] **Step 5: Thêm khối evidence vào `note` của `ActionGuidance`**

Trong fragment `note={ <> ... </> }`, thêm (sau khối `{preset && !isBuyZone && (...)}`):

```tsx
            {highConf && (
              <div className="verdict-note hc-evidence">
                Lịch sử ở kỳ 3 tháng, khi composite báo MUA <b>VÀ</b> giá ở vùng đáy: đúng{" "}
                <b>{HIGH_CONF_3M_EVIDENCE.trainFav}%</b> (2009–2018, n={HIGH_CONF_3M_EVIDENCE.trainN}) /{" "}
                <b>{HIGH_CONF_3M_EVIDENCE.testFav}%</b> (2019–2026, n={HIGH_CONF_3M_EVIDENCE.testN}); lưới thưa{" "}
                {HIGH_CONF_3M_EVIDENCE.sparseFav}% (n={HIGH_CONF_3M_EVIDENCE.sparseN}, CI{" "}
                {HIGH_CONF_3M_EVIDENCE.sparseCi[0]}–{HIGH_CONF_3M_EVIDENCE.sparseCi[1]}). Lớp đáy thêm +
                {HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt}pt so với chỉ siết composite cùng cỡ mẫu.{" "}
                <i>
                  Con số 100% là ước lượng lạc quan do tín hiệu bắn chùm trong một chu kỳ nới lỏng —
                  bằng chứng vững là lợi thế giai đoạn 2009–2018.
                </i>
              </div>
            )}
```

- [ ] **Step 6: Build để xác nhận không lỗi type/JSX**

Run: `npm run build`
Expected: build thành công (type của prop mới khớp, không lỗi TS).

- [ ] **Step 7: Kiểm thị giác nhanh**

Run: `npm run dev`, mở app, chọn preset "Sóng 3 tháng". Nếu hôm nay đang ở vùng MUA + `cycleBin==3`: thấy tag "(đã kiểm chứng — 3 tháng)" + khối evidence. Đổi sang preset 1m/6m: KHÔNG có tag/evidence. (Nếu hôm nay không phải vùng đó, xác nhận logic qua test Task 1 là đủ — không bịa trạng thái.)

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/components/Dashboard.tsx
git commit -m "feat(fusion): hiển thị evidence độ-tin-cao 3m trong hero verdict"
```

---

### Task 4: Tài liệu (`docs/fusion.md`)

**Files:**
- Create: `docs/fusion.md`

**Interfaces:** không có code; số liệu phải khớp `HIGH_CONF_3M_EVIDENCE` và đầu ra `scripts/fusion-study.ts`.

- [ ] **Step 1: Viết `docs/fusion.md`**

```markdown
# Fusion composite ∧ đáy — tầng "MUA độ tin cao": phương pháp & bằng chứng

Cập nhật: 2026-06-19. Sinh bởi `scripts/fusion-study.ts` (offline trên `public/data/timeline.json`).

## Câu hỏi
Ghép tín hiệu mua composite với lớp Bottom Hunter (vùng đáy) có cải thiện precision/recall/timing
một cách bền vững qua 2 giai đoạn không — hay composite-gốc đã là tốt nhất?

## Phương pháp
Offline trên timeline 4.275 ngày (2009–2026). Chia train <2019 / test ≥2019. "Đúng" = lợi suất H
phiên sau tín hiệu > 0. excess = precision − baseline (mua ngày bất kỳ). CI 95% block-bootstrap
(block=H/3) vì lưới dày (step=1) ⇒ tín hiệu bắn chùm. Ba cơ chế: A=hợp nhất (OR), B=xác nhận chéo
(AND, composite-buy ∧ cycleBin==3), C=gấp oversold vào composite (grid 5D).

## Kết quả — chỉ B ở kỳ 3 tháng GO

| Kỳ | B train | comp train | B test | comp test | n B (tr/te) | Phán quyết |
| --- | --- | --- | --- | --- | --- | --- |
| 1m | 84,5% | 79,9% | 70,4% | 76,0% | 84/108 | LOẠI (test ngược) |
| **3m** | **92,8%** | 81,6% | **100%** | 95,3% | 69/89 | **GIỮ** |
| 6m | 90,5% | 88,0% | 100% | 99,5% | 74/86 | LOẠI (đã chạm trần) |

Ba kiểm chứng robust cho 3m (đều PASS): (1) placebo đồng-n train **+10,1pt** (B vs composite-top-n
cùng cỡ mẫu) ⇒ lớp đáy thêm thông tin trực giao, không chỉ "kén hơn"; (2) chia nhiều giai đoạn:
2009–2013 +6,1pt, 2019–2026 +4,7pt (2014–2018 là sa mạc tín hiệu n=2, bỏ); (3) lưới thưa STEP=3:
B n=54 96,3% CI[88,9–100] vs composite 88,7%.

## Cảnh báo (đọc trước khi tin số)
Con số test 100% (CI[100–100]) là **ảo do tín hiệu bắn chùm** trong một chu kỳ nới lỏng 2019–2026 —
KHÔNG đọc là "chắc thắng". Bằng chứng ràng buộc là lợi thế **train +10,1pt** (giai đoạn chứa bear) và
lưới thưa decorrelated. B là tầng **ít tín hiệu hơn nhưng tin cậy hơn** (~136→69 tín hiệu train).

## Biến thể đã LOẠI (không tái thử mù khi chưa chạy lại fusion-study.ts)
- **A — hợp nhất (OR):** recall↑ nhưng precision loãng ở 3m/6m (composite đã gần trần). Chức năng "gom
  rải" đã do Bottom Hunter gauge đảm nhiệm ⇒ thêm A là trùng lặp.
- **B ở 1m/6m:** không robust (1m placebo-test âm & thưa thua composite; 6m 2009–2013 âm).
- **C — gấp oversold vào composite:** oversold sống sót grid (trọng số >0) nhưng cấu hình thắng có n
  sát sàn 25 còn cấu hình n lớn để oversold=0 ⇒ mùi overfit (như đã loại real-yield+GSR).

## Tích hợp & giám sát
Cờ dẫn xuất `highConfidenceBuy3m` (`src/lib/fusion.ts`) — KHÔNG sửa composite/engine đáy. Bồi evidence
vào cấp guidance "strong" sẵn có, chỉ khi 3m + vùng mua + cycleBin==3 + verified. `scripts/monitor-fusion.ts`
mỗi cron tính lại → `fusion-health.json`; degraded khi B không còn vượt composite cả 2 giai đoạn hoặc
placebo train ≤ 0 ⇒ UI ẩn evidence.

## Tái lập
\`\`\`bash
npx tsx scripts/fusion-study.ts     # A/B/C + 3 kiểm chứng robust cho B
npx tsx scripts/monitor-fusion.ts   # sức khỏe B-3m hiện tại
\`\`\`

`HIGH_CONF_3M_EVIDENCE` trong `src/lib/fusion.ts` phải khớp bảng này (khóa bằng `fusion.evidence.test.ts`).
```

(Trong file thật, dùng dấu ``` bình thường cho khối bash — bỏ dấu gạch chéo thoát.)

- [ ] **Step 2: Commit**

```bash
git add docs/fusion.md
git commit -m "docs(fusion): phương pháp + bằng chứng tầng MUA độ-tin-cao 3m"
```

---

## Kiểm tra cuối (sau cả 4 task)

- [ ] Run `npm test` → toàn bộ test xanh (gồm fusion.test, fusion.evidence.test, và các test sẵn có không hồi quy).
- [ ] Run `npm run build` → static export thành công.
- [ ] Xác nhận `git grep -n "VÙNG MUA — ĐỘ TIN CAO"` rỗng (không tạo nhãn mới — chỉ bồi evidence vào "strong").
