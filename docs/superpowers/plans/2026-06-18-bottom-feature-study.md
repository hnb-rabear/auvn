# Săn đáy precision study — feature lợi suất thực + vàng/bạc (Pha 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kiểm chứng (study, không build live) xem 2 feature trực giao mới — lợi suất thực (DFII10) và tỉ lệ Vàng/Bạc — có nâng *precision* bin-cao săn đáy vượt cấu hình hiện tại (`{rsi:.5, macro:.5}`) trên giai đoạn test không, ra GO/NO-GO.

**Architecture:** Thêm 2 feature `ryield`/`gsr` vào `bottomFeatures` (gated theo input optional — thiếu input ⇒ `na`, KHÔNG ảnh hưởng engine live). Một study script tự fetch bạc + lợi suất thực, chạy grid giới hạn quanh lõi rsi+macro, gate 2 giai đoạn theo precision, in bảng + GO/NO-GO. Ghi kết luận vào docs.

**Tech Stack:** TypeScript, Vitest (node-env), tsx scripts; hàm thuần trong `src/lib`; fetch qua `scripts/fetch.ts` (Yahoo SI=F + FRED DFII10).

## Global Constraints

- Chỉ dữ liệu free; chạy được trên free tier. Không thêm thư viện.
- UI/text tiếng Việt; giải thích feature là chuỗi tiếng Việt.
- **Pha 1 KHÔNG đụng:** `scripts/run.ts`/collect, `BOTTOM_CONFIG`, UI, `runBottom` signature. Chỉ `bottomFeatures` + fetch helpers + study script + docs.
- Bất biến: `runBottom(bars, null, null, {})` KHÔNG truyền input mới ⇒ golden cũ (`cycle.n=94, prob=78.7, swing.n=95, prob=100`) phải giữ nguyên.
- `gsr` percentile chỉ dùng cửa sổ trượt quá khứ (≤ ngày xét) — không look-ahead.

Spec: `docs/superpowers/specs/2026-06-18-bottom-feature-study-design.md`.

---

## File Structure

- `src/lib/bottom.ts` — **Modify.** Mở rộng `BottomFeatureInputs` (`realYieldCloses?`, `gsrCloses?`); thêm 2 feature `ryield`, `gsr` vào `bottomFeatures` (gated). Trách nhiệm: tính feature thuần theo index.
- `tests/bottom.test.ts` — **Modify.** Test dấu + gate `na` + regression golden.
- `scripts/fetch.ts` — **Modify.** `fetchSilver()` + `fetchRealYield()` (wrapper mỏng).
- `scripts/bottom-feature-study.ts` — **Create.** Harness study: fetch → drivers → grid → gate precision → GO/NO-GO.
- `docs/bottom.md` — **Modify.** Mục "Thử feature 2026-06 (ryield/gsr)" + kết quả.

---

## Task 1: Feature `ryield` + `gsr` trong bottomFeatures

**Files:**
- Modify: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

**Interfaces:**
- Consumes: hằng `clamp2`, helper `na(id,label)`, kiểu `BottomDriver`, `BottomFeatureInputs` (đang có `closes, dxyCloses, yieldCloses, fedRates`) — tất cả trong `src/lib/bottom.ts`.
- Produces: `bottomFeatures(inp)` trả về thêm 2 driver `id:"ryield"` và `id:"gsr"`. `BottomFeatureInputs` có thêm `realYieldCloses?: number[] | null` và `gsrCloses?: number[] | null` (gsrCloses = chuỗi tỉ lệ vàng/bạc ĐÃ ghép theo ngày, ≤ ngày xét; NaN ở ngày chưa có bạc được lọc trong feature).

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`, trong `describe("bottomFeatures", ...)` (cuối khối, trước `});`):

```ts
  it("ryield: lợi suất thực rơi 3 tháng ⇒ score > 0; tăng ⇒ < 0", () => {
    const closes = rng(800, () => 2000);
    const falling = rng(70, (i) => 2.0 - i * 0.02); // Δ63 ≈ -1.26đ
    const rising = rng(70, (i) => 0.5 + i * 0.02);
    const sFall = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [], realYieldCloses: falling }).find((d) => d.id === "ryield")!;
    const sRise = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [], realYieldCloses: rising }).find((d) => d.id === "ryield")!;
    expect(sFall.available).toBe(true);
    expect(sFall.score).toBeGreaterThan(0);
    expect(sRise.score).toBeLessThan(0);
  });

  it("gsr: tỉ lệ vàng/bạc percentile cao ⇒ score > 0; thấp ⇒ < 0", () => {
    const closes = rng(800, () => 2000);
    const hi = rng(510, (i) => 60 + i * 0.05);  // tăng dần -> last là cao nhất -> pct ~1
    const lo = rng(510, (i) => 120 - i * 0.05);  // giảm dần -> last thấp nhất -> pct ~0
    const sHi = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [], gsrCloses: hi }).find((d) => d.id === "gsr")!;
    const sLo = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [], gsrCloses: lo }).find((d) => d.id === "gsr")!;
    expect(sHi.score).toBeGreaterThan(0);
    expect(sLo.score).toBeLessThan(0);
  });

  it("ryield/gsr: thiếu input hoặc lịch sử ngắn ⇒ na (available:false)", () => {
    const f = bottomFeatures({ closes: rng(800, () => 2000), dxyCloses: [], yieldCloses: null, fedRates: [] });
    expect(f.find((d) => d.id === "ryield")!.available).toBe(false);
    expect(f.find((d) => d.id === "gsr")!.available).toBe(false);
    const short = bottomFeatures({ closes: rng(800, () => 2000), dxyCloses: [], yieldCloses: null, fedRates: [], realYieldCloses: rng(30, () => 1), gsrCloses: rng(100, () => 80) });
    expect(short.find((d) => d.id === "ryield")!.available).toBe(false);
    expect(short.find((d) => d.id === "gsr")!.available).toBe(false);
  });
```

(Khối `describe("bottomFeatures")` đã có sẵn helper `rng`.)

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/bottom.test.ts -t "ryield\|gsr"`
Expected: FAIL — `f.find(d=>d.id==="ryield")` undefined (chưa có feature).

- [ ] **Step 3: Mở rộng `BottomFeatureInputs`**

Trong `src/lib/bottom.ts`, interface `BottomFeatureInputs`, thêm sau `fedRates: number[];`:

```ts
  /** lợi suất thực (DFII10) đóng cửa cũ->mới, đã ≤ ngày xét; null/thiếu nếu không có */
  realYieldCloses?: number[] | null;
  /** chuỗi tỉ lệ Vàng/Bạc đã ghép theo ngày (≤ ngày xét); NaN ở ngày chưa có bạc */
  gsrCloses?: number[] | null;
```

- [ ] **Step 4: Thêm 2 feature vào `bottomFeatures`**

Trong `bottomFeatures`, NGAY TRƯỚC `return out;` (sau feature `mom`), thêm:

```ts
  // ryield: lợi suất thực đảo chiều — Δ ~63 phiên (đỉnh thực quay xuống = thuận đáy vàng).
  const ry = inp.realYieldCloses;
  if (!ry || ry.length < 64) out.push(na("ryield", "Lợi suất thực đảo chiều"));
  else {
    const dy = ry[ry.length - 1] - ry[ry.length - 64];
    const score = dy <= -0.2 ? 2 : dy <= -0.05 ? 1 : dy < 0.05 ? 0 : dy < 0.2 ? -1 : -2;
    out.push({
      id: "ryield", label: "Lợi suất thực đảo chiều", score: clamp2(score),
      explanation: `Lợi suất thực Δ3 tháng ${dy >= 0 ? "+" : ""}${fmt(dy, 2)}đ: ${score > 0 ? "đỉnh thực quay xuống, thuận đáy vàng" : score < 0 ? "thực đang lên, bất lợi" : "đi ngang"}.`,
      available: true,
    });
  }

  // gsr: tỉ lệ Vàng/Bạc cực đoan — percentile cửa sổ trượt 504 phiên QUÁ KHỨ (bạc bị
  // bán tháo ⇒ tỉ lệ cao ⇒ capitulation nhóm kim loại quý ⇒ gần đáy). Lọc NaN.
  const gsrAll = inp.gsrCloses ? inp.gsrCloses.filter(Number.isFinite) : null;
  if (!gsrAll || gsrAll.length < 504) out.push(na("gsr", "Tỉ lệ Vàng/Bạc cực đoan"));
  else {
    const win = gsrAll.slice(-504);
    const last = win[win.length - 1];
    const pct = win.filter((v) => v <= last).length / win.length;
    const score = pct >= 0.85 ? 2 : pct >= 0.7 ? 1 : pct > 0.3 ? 0 : pct > 0.15 ? -1 : -2;
    out.push({
      id: "gsr", label: "Tỉ lệ Vàng/Bạc cực đoan", score: clamp2(score),
      explanation: `Vàng/Bạc ${fmt(last, 1)} (percentile ${(pct * 100).toFixed(0)}% trong 2 năm): ${score > 0 ? "bạc bị bán tháo, capitulation nhóm kim loại quý" : score < 0 ? "chưa cực đoan" : "trung tính"}.`,
      available: true,
    });
  }
```

(`clamp2`, `na`, `fmt` đã có sẵn trong file. `fmt` được khai báo đầu `bottomFeatures`.)

- [ ] **Step 5: Chạy test — PASS + golden không đổi**

Run: `npx vitest run tests/bottom.test.ts`
Expected: tất cả PASS — 3 test mới + golden cũ (`cycle.n=94, prob=78.7, swing.n=95, prob=100` trong test "signalHistory dày...") KHÔNG đổi (runBottom không truyền input mới ⇒ ryield/gsr `na` ⇒ score giữ nguyên).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): feature ứng viên ryield + gsr (gated, an toàn live) cho study đáy"
```

---

## Task 2: Fetchers + study script (deliverable: GO/NO-GO)

**Files:**
- Modify: `scripts/fetch.ts`
- Create: `scripts/bottom-feature-study.ts`

**Interfaces:**
- Consumes: `bottomFeatures`, `bottomScore`, `binOf`, `labelNearBottom` từ `../src/lib/bottom`; `blockBootstrapCi` từ `../src/lib/indicators`; `fetchXau, fetchDxy, fetchFedFunds, fetchYield10y` từ `./fetch`; hằng `fetchYahoo`/`fetchFredSeries` (nội bộ `fetch.ts`). Feature input `realYieldCloses`/`gsrCloses` từ Task 1.
- Produces: `fetchSilver()`, `fetchRealYield()` exported từ `scripts/fetch.ts`; script in bảng + dòng `GO`/`NO-GO`.

> Study là script nghiên cứu (như `bottom-study.ts`) — không có unit test riêng; verify bằng chạy tay. Hàm thuần nó dựa vào (`bottomFeatures`, `blockBootstrapCi`) đã được test.

- [ ] **Step 1: Thêm fetchers vào `scripts/fetch.ts`**

Sau `fetchVix` (mẫu y hệt), thêm:

```ts
export async function fetchSilver(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const y = await fetchYahoo("SI=F");
    return { bars: y.bars, source: "yahoo:SI=F" };
  } catch {
    return null;
  }
}

/** Lợi suất thực 10 năm (TIPS) — FRED DFII10. Free, từ ~2003. */
export async function fetchRealYield(): Promise<{ bars: DailyBar[]; source: string } | null> {
  const bars = await fetchFredSeries("DFII10", 500);
  return bars ? { bars, source: "fred:DFII10" } : null;
}
```

- [ ] **Step 2: Tạo `scripts/bottom-feature-study.ts`**

```ts
/**
 * STUDY (Pha 1) — feature ứng viên ryield (lợi suất thực) + gsr (vàng/bạc) có nâng
 * PRECISION bin-cao săn đáy CHU KỲ (H=126, eps=3%) vượt lõi {rsi,macro} không?
 * Grid giới hạn 4 feature {rsi,macro,ryield,gsr} (bước .25) × 3 bộ bin edges,
 * gate 2 giai đoạn (train<2019 / test>=2019) theo precision + recall sàn,
 * CI block-bootstrap. In GO/NO-GO. KHÔNG đổi config — chỉ nghiên cứu.
 *
 * Chạy: npx tsx scripts/bottom-feature-study.ts  (cần mạng: Yahoo + FRED)
 */
import { bottomFeatures, bottomScore, binOf, labelNearBottom } from "../src/lib/bottom";
import { blockBootstrapCi } from "../src/lib/indicators";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y, fetchSilver, fetchRealYield } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756, STEP = 3, H = 126, EPS = 3, RECALL_FLOOR = 40;
const KEYS = ["rsi", "macro", "ryield", "gsr"] as const;

function weightGrid4(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const rec = (idx: number, left: number, acc: number[]) => {
    if (idx === KEYS.length - 1) { acc.push(left); const w: Record<string, number> = {}; KEYS.forEach((k, j) => (w[k] = acc[j] / 4)); out.push(w); acc.pop(); return; }
    for (let u = 0; u <= left; u++) { acc.push(u); rec(idx + 1, left - u, acc); acc.pop(); }
  };
  rec(0, 4, []);
  return out;
}

/** Ghép tỉ lệ vàng/bạc theo ngày của vàng: với mỗi ngày vàng, lấy bạc mới nhất ≤ ngày đó.
 *  Trả mảng cùng độ dài/căn index với goldDates; NaN nếu chưa có bạc. */
function buildGsr(goldDates: string[], goldCloses: number[], silver: { date: string; close: number }[]): number[] {
  const sv = [...silver].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < goldDates.length; i++) {
    while (s + 1 < sv.length && sv[s + 1].date <= goldDates[i]) s++;
    const ok = sv.length > 0 && sv[s].date <= goldDates[i] && sv[s].close > 0;
    out.push(ok ? goldCloses[i] / sv[s].close : NaN);
  }
  return out;
}

async function main() {
  const [xau, dxy, fed, y10, silver, realy] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
    fetchSilver().catch(() => null),
    fetchRealYield().catch(() => null),
  ]);
  if (!silver) { console.error("THIẾU dữ liệu bạc (SI=F) — dừng."); process.exit(1); }
  if (!realy) { console.error("THIẾU lợi suất thực (DFII10) — dừng."); process.exit(1); }

  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const gsrAligned = buildGsr(dates, closes, silver.bars);

  const gridDays: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) gridDays.push(i);

  // drivers tính 1 lần/ngày (độc lập trọng số/edges)
  type Row = { i: number; date: string; drivers: ReturnType<typeof bottomFeatures>; label: boolean | null };
  const rows: Row[] = gridDays.map((i) => {
    const di = dates[i];
    return {
      i, date: di,
      drivers: bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: y10 ? y10.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
        realYieldCloses: realy.bars.filter((b) => b.date <= di).map((b) => b.close),
        gsrCloses: gsrAligned.slice(0, i + 1),
      }),
      label: labelNearBottom(closes, i, H, EPS),
    };
  });

  // độ phủ dữ liệu
  const covRy = rows.filter((r) => r.drivers.find((d) => d.id === "ryield")!.available).length;
  const covGsr = rows.filter((r) => r.drivers.find((d) => d.id === "gsr")!.available).length;
  console.log(`Lưới ${rows.length} ngày (${dates[WARMUP]}→${dates[dates.length - 1]}) · phủ ryield ${covRy}/${rows.length} · phủ gsr ${covGsr}/${rows.length}`);

  const EDGE_SETS = [[-40, 0, 40], [-40, 0, 30], [-40, 0, 20]];
  const labeled = (rs: Row[]) => rs.filter((r) => r.label !== null);
  const stat = (rs: Row[], w: Record<string, number>, edges: number[]) => {
    const lab = labeled(rs);
    const base = lab.length ? lab.filter((r) => r.label).length / lab.length : 0;
    const top = lab.filter((r) => binOf(bottomScore(r.drivers, w), edges) === edges.length);
    const n = top.length;
    const prec = n ? top.filter((r) => r.label).length / n : 0;
    return { base, n, prec, arr: top.map((r) => (r.label ? 1 : -1)) };
  };
  const train = rows.filter((r) => r.date < SPLIT);
  const test = rows.filter((r) => r.date >= SPLIT);

  // mốc: lõi {rsi:.5,macro:.5}, edges chuẩn [-40,0,40]
  const BASE_W = { rsi: 0.5, macro: 0.5, ryield: 0, gsr: 0 };
  const baseTest = stat(test, BASE_W, [-40, 0, 40]);
  const baseTrain = stat(train, BASE_W, [-40, 0, 40]);
  console.log(`\nMỐC {rsi:.5,macro:.5}: train prec ${(baseTrain.prec * 100).toFixed(0)}% (n=${baseTrain.n}, base ${(baseTrain.base * 100).toFixed(0)}%) | test prec ${(baseTest.prec * 100).toFixed(0)}% (n=${baseTest.n}, base ${(baseTest.base * 100).toFixed(0)}%)`);

  const profiles = weightGrid4();
  type Cand = { w: Record<string, number>; edges: number[]; tr: ReturnType<typeof stat>; te: ReturnType<typeof stat> };
  const passed: Cand[] = [];
  for (const edges of EDGE_SETS) for (const w of profiles) {
    const tr = stat(train, w, edges), te = stat(test, w, edges);
    const gate = tr.prec > tr.base && te.prec > te.base; // vượt baseline cả 2 giai đoạn
    if (gate && te.n >= RECALL_FLOOR && tr.n >= RECALL_FLOOR) passed.push({ w, edges, tr, te });
  }
  passed.sort((a, b) => b.te.prec - a.te.prec);

  console.log(`\n${passed.length} cấu hình qua gate (recall sàn n>=${RECALL_FLOOR} cả 2 giai đoạn). Top 5 theo precision test:`);
  const fmtW = (w: Record<string, number>) => KEYS.map((k) => `${k} ${w[k]}`).filter((s) => !s.endsWith(" 0")).join(" ");
  for (const c of passed.slice(0, 5)) {
    const ci = blockBootstrapCi(c.te.arr, Math.max(1, Math.round(H / 3)));
    console.log(`  [${c.edges.join(",")}] ${fmtW(c.w)} | test prec ${(c.te.prec * 100).toFixed(0)}% n=${c.te.n}${ci ? ` CI[${ci[0]}-${ci[1]}]` : ""} | train prec ${(c.tr.prec * 100).toFixed(0)}% n=${c.tr.n}`);
  }

  // GO: cấu hình tốt nhất CÓ ryield|gsr>0, CI test lo > precision mốc, qua gate, recall sàn
  const best = passed.find((c) => c.w.ryield > 0 || c.w.gsr > 0);
  let go = false;
  if (best) {
    const ci = blockBootstrapCi(best.te.arr, Math.max(1, Math.round(H / 3)));
    go = !!ci && ci[0] > baseTest.prec * 100;
    console.log(`\nỨng viên tốt nhất CÓ feature mới: [${best.edges.join(",")}] ${fmtW(best.w)} | test prec ${(best.te.prec * 100).toFixed(0)}%${ci ? ` CI[${ci[0]}-${ci[1]}]` : ""} vs mốc ${(baseTest.prec * 100).toFixed(0)}%`);
  } else {
    console.log(`\nKhông cấu hình nào qua gate có trọng số ryield/gsr > 0.`);
  }
  console.log(`\n${go ? "GO" : "NO-GO"} — ${go ? "feature mới nâng precision test vượt mốc (CI không chồng); cân nhắc Pha 2." : "không đủ bằng chứng feature mới vượt mốc; giữ cấu hình hiện tại."}`);
}

main();
```

> Lưu ý: import dòng đầu phải bỏ `type` thừa — dùng đúng: `import { bottomFeatures, bottomScore, binOf, labelNearBottom } from "../src/lib/bottom";`. (Sửa khi gõ — không để token `type` lơ lửng.)

- [ ] **Step 3: Build + chạy study**

Run: `npx tsc --noEmit` → Expected: sạch (không lỗi type ở fetch.ts + study).
Run: `npx tsx scripts/bottom-feature-study.ts`
Expected: in được dòng "Lưới … phủ ryield … phủ gsr …", dòng MỐC, danh sách top, và **GO** hoặc **NO-GO**. (Cần mạng; nếu fetch bạc/thực fail sẽ dừng với thông báo THIẾU — báo lại để xử lý mạng, không coi là lỗi code.)

Ghi lại nguyên văn output (bảng + GO/NO-GO + độ phủ) để dùng ở Task 3.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch.ts scripts/bottom-feature-study.ts
git commit -m "study(bottom): fetch bạc/lợi-suất-thực + harness grid precision ryield/gsr"
```

---

## Task 3: Ghi kết quả vào docs/bottom.md

**Files:**
- Modify: `docs/bottom.md`

**Interfaces:**
- Consumes: output GO/NO-GO + bảng precision từ Task 2 Step 3.

- [ ] **Step 1: Thêm mục kết quả**

Thêm mục mới vào CUỐI `docs/bottom.md` (điền số THỰC từ Task 2 — đây là nơi DUY NHẤT có placeholder, phải thay bằng output thật):

```markdown
## Thử feature 2026-06: lợi suất thực (DFII10) + Vàng/Bạc — kết quả

`scripts/bottom-feature-study.ts` (grid {rsi,macro,ryield,gsr} bước .25 × 3 bộ bin, gate train<2019/test≥2019, tối ưu precision bin-cao chu kỳ H=126/ε3%, recall sàn n≥40, CI block-bootstrap).

- **Độ phủ dữ liệu:** ryield <covRy>/<tổng>, gsr <covGsr>/<tổng> ngày lưới.
- **Mốc {rsi:.5,macro:.5}:** test precision <baseTest>% (n=<n>).
- **Ứng viên tốt nhất có feature mới:** <cấu hình> — test precision <prec>% CI[<lo>-<hi>].
- **Phán quyết: <GO|NO-GO>.** <1 câu lý do từ output: feature có vượt mốc với CI không chồng không.>

Đối chiếu `scripts/bottom-detection-compare.ts`: confluence 2 tầng = no-op (chung điểm số); cycle=3 hiện tại đã 76% win 6 tháng. <Nếu NO-GO: giữ cấu hình {rsi,macro}; feature mới không vượt out-of-sample, ghi nhận như đã loại GPR/VIX.>
```

Thay mọi `<…>` bằng số/chữ thật từ output Task 2. Nếu GO: thêm câu "→ mở spec Pha 2 (wire live + đổi BOTTOM_CONFIG)".

- [ ] **Step 2: Commit**

```bash
git add docs/bottom.md
git commit -m "docs(bottom): kết quả study feature ryield/gsr (GO/NO-GO)"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** feature ryield/gsr gated (Task 1) khớp bảng scoring spec; fetch SI=F/DFII10 (Task 2); grid giới hạn 4-feature + gate 2 giai đoạn + precision + recall sàn + CI-không-chồng + weight>0 (Task 2 GO rule); docs kết quả (Task 3). ML cross-check đã hạ tùy chọn ở spec → KHÔNG có task (đúng, tránh gold-plating). Không đụng collect/config/UI/runBottom.
- **Bất biến golden:** Task 1 chỉ sửa `bottomFeatures` + thêm input optional; `runBottom` không truyền ⇒ na ⇒ golden giữ (Task 1 Step 5 kiểm).
- **Type consistency:** `realYieldCloses`/`gsrCloses` (Task 1) = input study bơm (Task 2). `fetchSilver`/`fetchRealYield` (Task 2 fetch.ts) dùng trong study (Task 2). `binOf(score,edges)===edges.length` = bin cao nhất (khớp `binOf` hiện có). `blockBootstrapCi(arr, round(H/3))` khớp chữ ký (returns `[lo,hi]|null`, %).
- **No look-ahead:** gsr percentile chỉ trên `gsrCloses.slice(0,i+1)` (≤ ngày i); ryield/yield/dxy/fed đều filter `≤ di`.
- **Placeholder:** chỉ Task 3 docs có `<…>` — bắt buộc thay bằng output thật Task 2 (đã ghi rõ).
