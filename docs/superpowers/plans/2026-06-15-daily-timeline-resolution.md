# Timeline độ phân giải theo phiên — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép tra cứu mọi phiên giao dịch T2–T6 trong Time Machine bằng cách lấy mẫu timeline mỗi phiên (STEP=1), trong khi mọi thống kê (backtest buckets, bottom prob/CI/n) giữ STEP=3 để không xê dịch.

**Architecture:** Tách hai lưới index trong `scripts/backtest.ts` và `src/lib/bottom.ts`. Lưới THỐNG KÊ (thưa, STEP=3) nuôi `returns`→buckets và `labeled`→prob/ci/n. Lưới HIỂN THỊ (dày, STEP=1) nuôi `timeline.points`, `signalHistory`, `confirmedBottoms`. Hai lưới độc lập trong cùng vòng chạy; giá trị thống kê giữ nguyên vì bin/return của một ngày là hàm thuần của ngày đó, không phụ thuộc lưới.

**Tech Stack:** TypeScript, Vitest, tsx (Node). Không thêm dependency.

---

## File Structure

- **`scripts/backtest.ts`** (modify) — tách vòng `idxs` thành lưới stat (STEP=3) + lưới timeline (STEP=1). Stat nuôi `returns`/`observations`; timeline nuôi `points`.
- **`src/lib/bottom.ts`** (modify) — `buildTier` tách lưới: thưa→prob/ci/n, dày→rows (signalHistory + confirmedBottoms).
- **`src/components/TimeMachine.tsx`** (modify) — sửa hằng `POINTS_PER_MONTH` 7→21 (chú thích sai sau khi dày).
- **`tests/engine.test.ts`** (modify) — nới các assert giả định `points.length === observations`; thêm golden test buckets không đổi + timeline phủ mọi bar.
- **`tests/bottom.test.ts`** (modify) — thêm assert signalHistory dày + prob/n giữ thưa.

**Bất biến chốt:** `STEP` constant trong cả hai file vẫn = 3 và **chỉ** dùng cho lưới thống kê. Lưới hiển thị dùng bước 1 cố định.

---

## Task 1: Backtest — tách lưới thống kê và lưới timeline

**Files:**
- Modify: `scripts/backtest.ts:62-151` (vòng `idxs` + thân vòng)
- Test: `tests/engine.test.ts`

Bối cảnh code hiện tại (`scripts/backtest.ts:62-151`): một vòng dựng `idxs` theo STEP=3, rồi `for (const i of idxs)` vừa push vào `returns` map (nuôi buckets) vừa `points.push(...)`. Cần tách: phần tính criteria/composite/scores/returns cho **một index** là chung; chỉ khác **tập index** và **đích ghi** (returns map vs points array).

- [ ] **Step 1: Viết test golden — buckets không đổi sau khi tách**

Thêm vào `tests/engine.test.ts` trong `describe("backtest", ...)`:

```typescript
it("tách sampling KHÔNG đổi buckets thống kê (golden)", () => {
  const bars = range(1400, (i) => ({
    date: new Date(Date.UTC(2019, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    close: 1500 + 300 * Math.sin(i / 80) + i * 0.1,
  }));
  const { backtest: bt } = runBacktest(bars, null, null);
  // Giá trị chốt từ engine STEP=3 hiện tại (đặc trưng hóa trước khi đổi).
  expect(bt.observations).toBe(216);
  const snap = bt.buckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.zone}|${b.horizonDays}:${b.count}:${b.pctFavorable}:${b.medianReturnPct}`);
  expect(snap).toEqual([
    "buy|21:99:12.1:-3.5",
    "buy|63:85:20:-8.5",
    "buy|126:64:42.2:-5.5",
    "neutral|21:50:null:2.3",
    "neutral|63:50:null:10.9",
    "neutral|126:50:null:26.7",
    "sell|21:51:17.6:3.6",
    "sell|63:51:31.4:7.9",
    "sell|126:51:37.3:6.1",
    "strong-sell|21:8:0:1.9",
    "strong-sell|63:8:0:2.6",
    "strong-sell|126:8:100:-4",
  ]);
});
```

- [ ] **Step 2: Chạy test — phải PASS với code hiện tại (đặc trưng hóa)**

Run: `npx vitest run tests/engine.test.ts -t "golden"`
Expected: PASS (xác nhận snapshot khớp engine STEP=3 hiện tại trước khi sửa).

- [ ] **Step 3: Viết test timeline dày — phủ mọi bar sau warmup**

Thêm vào `tests/engine.test.ts`:

```typescript
it("timeline lấy mẫu mỗi phiên (phủ mọi bar sau warmup)", () => {
  const bars = range(1400, (i) => ({
    date: new Date(Date.UTC(2019, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    close: 1500 + 300 * Math.sin(i / 80) + i * 0.1,
  }));
  const WARMUP = 756;
  const { timeline } = runBacktest(bars, null, null);
  // STEP=1: mỗi bar từ WARMUP đến hết là một điểm.
  expect(timeline.points.length).toBe(bars.length - WARMUP); // 644
  // không trùng ngày liền kề
  for (let i = 1; i < timeline.points.length; i++) {
    expect(timeline.points[i].date).not.toBe(timeline.points[i - 1].date);
  }
  // điểm cuối là bar cuối, chưa có dữ liệu tương lai
  expect(timeline.points[timeline.points.length - 1].date).toBe(bars[bars.length - 1].date);
  expect(timeline.points[timeline.points.length - 1].returns["21"]).toBeNull();
});
```

- [ ] **Step 4: Chạy test — phải FAIL (timeline còn thưa)**

Run: `npx vitest run tests/engine.test.ts -t "mỗi phiên"`
Expected: FAIL — `points.length` là 216 (STEP=3), không phải 644.

- [ ] **Step 5: Tách lưới trong `scripts/backtest.ts`**

Thay khối `scripts/backtest.ts:62-151`. Cấu trúc mới: rút phần tính-một-index thành closure `evalAt(i)` trả về `{ point, zone }`; lưới stat đẩy returns + đếm observations; lưới timeline đẩy points.

Thay từ dòng 62 (`const idxs: number[] = [];`) đến **dòng 151 — dấu `}` đóng vòng `for (const i of idxs)`** (bao gồm cả dòng 151 này; nếu bỏ sót sẽ thừa một `}` lủng lẳng) bằng:

```typescript
  // Tính criteria/composite/scores/returns past-only cho MỘT index. Dùng chung
  // cho cả lưới thống kê (thưa) lẫn lưới hiển thị (dày) — giá trị một ngày là
  // hàm thuần của ngày đó, không phụ thuộc lưới.
  const evalAt = (i: number): { point: TimelinePoint; zone: Zone } => {
    const date = dates[i];
    const closesUpTo = closes.slice(0, i + 1);
    const datesUpTo = dates.slice(0, i + 1);

    const criteria = [
      technicalCriterion(closesUpTo),
      statsCriterion(closesUpTo, datesUpTo, season),
    ];

    // Macro chạy khi có DXY; Fed (và yield/vix/gpr) là tùy chọn — macroCriterion
    // tự bỏ qua từng tín hiệu con thiếu dữ liệu, giống hệt đường phân tích live.
    // KHÔNG đòi cả dxy && fed: một lần FRED chập chờn từng xóa macro khỏi TOÀN BỘ lịch sử.
    if (dxy) {
      while (dxyPtr < dxy.length && dxy[dxyPtr].date <= date) dxyPtr++;
      const dxyCloses = dxy.slice(0, dxyPtr).map((b) => b.close);
      let fedRates: number[] = [];
      if (fed) {
        while (fedPtr < fed.length && fed[fedPtr].date <= date) fedPtr++;
        fedRates = fed.slice(0, fedPtr).map((f) => f.value);
      }
      if (dxyCloses.length >= 51) {
        let yield10y: { closes: number[]; real: boolean } | undefined;
        if (yieldBars) {
          while (yieldPtr < yieldBars.length && yieldBars[yieldPtr].date <= date) yieldPtr++;
          yield10y = {
            closes: yieldBars.slice(0, yieldPtr).map((b) => b.close),
            real: extras.yield10y!.real,
          };
        }
        let vixCloses: number[] | undefined;
        if (vixBars) {
          while (vixPtr < vixBars.length && vixBars[vixPtr].date <= date) vixPtr++;
          vixCloses = vixBars.slice(0, vixPtr).map((b) => b.close);
        }
        let gprCloses: number[] | undefined;
        if (gprBars) {
          while (gprPtr < gprBars.length && gprBars[gprPtr].date <= date) gprPtr++;
          gprCloses = gprBars.slice(0, gprPtr).map((b) => b.close);
        }
        criteria.push(
          macroCriterion({
            dxyCloses,
            fedRates,
            usdVndHistory: [],
            yield10y,
            vixCloses,
            gprCloses,
          })
        );
      }
    }

    const composite = compositeScore(criteria, DEFAULT_WEIGHTS);
    const zone = zoneOf(composite);

    const fwd: TimelinePoint["returns"] = { "21": null, "63": null, "126": null };
    for (const h of horizons) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      fwd[String(h) as keyof TimelinePoint["returns"]] = Math.round(r * 10) / 10;
    }

    const scores: TimelinePoint["scores"] = {};
    for (const c of criteria) {
      if (c.available) scores[c.key] = Math.round(c.score * 100) / 100;
    }
    if (extras.momentum12m) {
      const mc = momentumCriterion(closesUpTo);
      if (mc.available) scores[mc.key] = Math.round(mc.score * 100) / 100;
    }

    const point: TimelinePoint = {
      date,
      price: Math.round(closes[i] * 10) / 10,
      composite,
      zone,
      scores,
      returns: fwd,
    };
    return { point, zone };
  };

  // --- Lưới THỐNG KÊ (thưa, STEP) — nuôi returns map + observations. Giữ STEP
  // để chống pseudo-replication: cửa sổ return của ngày liền kề chồng lấn nặng,
  // chấm mỗi ngày sẽ phình n giả và co CI giả. KHÔNG đổi sang bước 1.
  const statIdxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) statIdxs.push(i);
  if (statIdxs.length && statIdxs[statIdxs.length - 1] !== closes.length - 1)
    statIdxs.push(closes.length - 1);
  for (const i of statIdxs) {
    const { zone } = evalAt(i);
    observations++;
    for (const h of horizons) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      const key = `${zone}|${h}`;
      const arr = returns.get(key) ?? [];
      arr.push(r);
      returns.set(key, arr);
    }
  }

  // --- Lưới HIỂN THỊ (dày, mỗi phiên) — nuôi timeline.points để tra cứu mọi
  // ngày T2–T6. KHÔNG đẩy vào returns map (thống kê đã xong ở lưới thưa).
  // Pointer dxyPtr/fedPtr/... được evalAt tua tiến đơn điệu; reset về 0 trước
  // lưới dày vì các index quay lại từ WARMUP.
  dxyPtr = 0;
  fedPtr = 0;
  yieldPtr = 0;
  vixPtr = 0;
  gprPtr = 0;
  for (let i = WARMUP; i < closes.length; i += 1) {
    points.push(evalAt(i).point);
  }
```

Lưu ý quan trọng: `evalAt` đọc các con trỏ `dxyPtr`/`fedPtr`/`yieldPtr`/`vixPtr`/`gprPtr` (khai báo ở dòng 53-57, vẫn giữ). Chúng tua tiến đơn điệu theo `date` tăng dần. Cả hai lưới đều duyệt index tăng từ WARMUP, nên reset toàn bộ về 0 giữa hai lưới (đã làm ở trên) là đủ và đúng.

- [ ] **Step 6: Chạy lại cả hai test mới**

Run: `npx vitest run tests/engine.test.ts -t "golden" && npx vitest run tests/engine.test.ts -t "mỗi phiên"`
Expected: cả hai PASS. Golden xác nhận buckets/observations **không đổi**; "mỗi phiên" xác nhận timeline = 644 điểm.

- [ ] **Step 7: Sửa các test cũ giả định `points.length === observations`**

Trong `tests/engine.test.ts`:

Tại test "runs on synthetic series..." (dòng ~284), đổi:
```typescript
    expect(timeline.points.length).toBe(bt.observations);
```
thành:
```typescript
    // timeline dày hơn thống kê: mỗi phiên một điểm, observations lấy mẫu thưa
    expect(timeline.points.length).toBeGreaterThan(bt.observations);
```

Tại test "timeline's last point is the final bar even when off the step grid" (dòng ~296-308), bỏ assert `expect(timeline.points.length).toBe(bt.observations);` (dòng 307) và giữ phần còn lại (điểm cuối = bar cuối, returns["21"] null). Với STEP=1 bar cuối luôn on-grid nên test vẫn ý nghĩa.

Tại test "does not duplicate the last point when the final bar is on the step grid" (dòng ~310-323), đổi assert cuối:
```typescript
    expect(pts.length).toBe(bt.observations);
```
thành:
```typescript
    const WARMUP = 756;
    expect(pts.length).toBe(bars.length - WARMUP); // 1300-756=544, lưới dày STEP=1
```

- [ ] **Step 8: Chạy toàn bộ engine.test.ts**

Run: `npx vitest run tests/engine.test.ts`
Expected: tất cả PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/backtest.ts tests/engine.test.ts
git commit -m "feat(backtest): tách lưới timeline mỗi phiên (STEP=1) khỏi lưới thống kê (STEP=3)"
```

---

## Task 2: Bottom — signalHistory + confirmedBottoms dày, prob/ci/n giữ thưa

**Files:**
- Modify: `src/lib/bottom.ts:175-203` (`buildTier`)
- Test: `tests/bottom.test.ts`

Bối cảnh (`src/lib/bottom.ts:181-202`): `buildTier` dựng một lưới `idxs` STEP=3, sinh `rows` (mọi index), rồi từ `rows` lọc `labeled` (cùng bin với curBin) để tính `prob`/`ci`/`n`. `rows` lại được `runBottom` dùng cho `signalHistory` (runBottom:246) và `collect()` confirmedBottoms (runBottom:239-240). Cần: prob/ci/n từ lưới THƯA, nhưng rows từ lưới DÀY.

- [ ] **Step 1: Viết test — signalHistory dày nhưng prob/n giữ thưa**

Thêm vào `tests/bottom.test.ts` trong `describe("runBottom", ...)`:

```typescript
it("signalHistory dày mỗi phiên nhưng prob/n giữ lưới thưa", () => {
  const WARMUP = 756;
  const r = runBottom(bars, null, null, {});
  // signalHistory phủ mọi bar sau warmup (lưới dày STEP=1)
  expect(r.signalHistory.length).toBe(bars.length - WARMUP); // 1600-756=844
  // prob/n KHÔNG đổi: vẫn lưới thưa STEP=3 (đặc trưng hóa giá trị hiện tại)
  expect(r.cycle.n).toBe(94);
  expect(r.cycle.prob).toBe(78.7);
  expect(r.swing.n).toBe(95);
  expect(r.swing.prob).toBe(100);
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npx vitest run tests/bottom.test.ts -t "dày mỗi phiên"`
Expected: FAIL — `signalHistory.length` là 282 (STEP=3), không phải 844.

- [ ] **Step 3: Tách lưới trong `buildTier`**

Thay thân `buildTier` (`src/lib/bottom.ts:181-202`). Tách `rows` (dày, STEP=1, cho signalHistory/confirmedBottoms) khỏi tập tính prob/ci/n (thưa, STEP). `curBin` không đổi.

Thay từ dòng 181 (`const rows: HistRow[] = [];`) đến dòng 202 (`return { ... };`) bằng:

```typescript
  // Đánh giá một index: drivers + score + bin + label (đều past-only, hàm thuần
  // của index — không phụ thuộc lưới nào gọi).
  const evalRow = (i: number): HistRow => {
    const drivers = featuresAt(i);
    const score = bottomScore(drivers, cfg.weights);
    const bin = binOf(score, cfg.binEdges);
    const label = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
    return { i, date: dates[i], score, bin, label };
  };

  const curDrivers = featuresAt(closes.length - 1);
  const curScore = bottomScore(curDrivers, cfg.weights);
  const curBin = binOf(curScore, cfg.binEdges);

  // --- Lưới THƯA (STEP) — base-rate prob/ci/n. Giữ STEP để chống
  // pseudo-replication: ngày liền kề có cửa sổ near-bottom chồng lấn, chấm mỗi
  // ngày sẽ phình n giả và co CI giả. KHÔNG đổi sang bước 1.
  const statRows: HistRow[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) statRows.push(evalRow(i));
  if (statRows.length && statRows[statRows.length - 1].i !== closes.length - 1)
    statRows.push(evalRow(closes.length - 1));
  const labeled = statRows.filter((r) => r.label !== null && r.bin === curBin);
  const favArr = labeled.map((r) => (r.label ? 1 : -1));
  const n = labeled.length;
  const prob = n ? Math.round((favArr.filter((x) => x > 0).length / n) * 1000) / 10 : 0;
  const ci = blockBootstrapCi(favArr, Math.max(1, Math.round(cfg.horizonDays / 3)));

  // --- Lưới DÀY (mỗi phiên) — rows cho signalHistory (bin từng ngày cho Time
  // Machine) + confirmedBottoms (không sót đáy off-grid). KHÔNG nuôi prob/ci/n.
  const rows: HistRow[] = [];
  for (let i = WARMUP; i < closes.length; i += 1) rows.push(evalRow(i));

  return { result: { prob, ci, bin: curBin, n }, rows, currentDrivers: curDrivers };
```

Lưu ý: biến trả về cũ tên `currentDrivers`; ở trên đổi tên cục bộ thành `curDrivers` nhưng map đúng vào khóa `currentDrivers` của object trả về — chữ ký `buildTier` (dòng 180) không đổi.

- [ ] **Step 4: Chạy test mới**

Run: `npx vitest run tests/bottom.test.ts -t "dày mỗi phiên"`
Expected: PASS — signalHistory=844, prob/n giữ nguyên 94/78.7/95/100.

- [ ] **Step 5: Chạy toàn bộ bottom.test.ts (đảm bảo test cũ vẫn pass)**

Run: `npx vitest run tests/bottom.test.ts`
Expected: tất cả PASS. Đặc biệt test ":161" (tái dựng n bằng STEP=3) và ":201" (signalHistory phủ bar cuối) vẫn xanh.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): signalHistory/confirmedBottoms lấy mẫu mỗi phiên, prob/ci/n giữ lưới thưa"
```

---

## Task 3: UI — sửa hằng `POINTS_PER_MONTH`

**Files:**
- Modify: `src/components/TimeMachine.tsx:62-63`

Chú thích hiện tại sai sau khi dày: timeline không còn "mẫu mỗi 3 phiên → ~7 điểm/tháng" mà là ~21 phiên giao dịch/tháng. Hằng này điều khiển độ rộng cửa sổ các nút zoom (6 tháng, 1 năm…) tại `applyZoom` (dòng 130: `m * POINTS_PER_MONTH`).

- [ ] **Step 1: Sửa hằng và chú thích**

Tại `src/components/TimeMachine.tsx:62-63`, đổi:
```typescript
// timeline lấy mẫu mỗi 3 phiên -> ~7 điểm/tháng
const POINTS_PER_MONTH = 7;
```
thành:
```typescript
// timeline lấy mẫu mỗi phiên giao dịch -> ~21 phiên/tháng
const POINTS_PER_MONTH = 21;
```

- [ ] **Step 2: Kiểm tra build TypeScript**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "fix(ui): POINTS_PER_MONTH=21 khớp timeline mỗi phiên (nút zoom căn đúng cửa sổ)"
```

---

## Task 4: Verify tích hợp — data thật, backtest.json không đổi

**Files:** không sửa code; chạy pipeline thật và đối chiếu.

- [ ] **Step 1: Lưu backtest.json hiện tại để so sánh**

```bash
cp public/data/backtest.json /tmp/backtest-before.json
cp public/data/bottom.json /tmp/bottom-before.json
```

- [ ] **Step 2: Chạy toàn bộ test suite**

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 3: Chạy pipeline thu thập + phân tích thật**

Run: `npx tsx scripts/run.ts`
Expected: chạy xong, ghi `public/data/*.json`. (Nếu mạng chặn fetch, dùng dữ liệu cache sẵn — vẫn sinh lại analysis/backtest/timeline/bottom.)

- [ ] **Step 4: So backtest buckets KHÔNG đổi (integrity)**

```bash
npx tsx -e "const a=require('./public/data/backtest.json');const b=require('/tmp/backtest-before.json');const ja=JSON.stringify(a.buckets);const jb=JSON.stringify(b.buckets);console.log('observations:',a.observations,'vs',b.observations);console.log('buckets identical:',ja===jb);process.exit(ja===jb?0:1);"
```
Expected: `observations` bằng nhau, `buckets identical: true`. (generatedAt sẽ khác — chỉ so observations + buckets.)

- [ ] **Step 5: So bottom prob/ci/n KHÔNG đổi**

```bash
npx tsx -e "const a=require('./public/data/bottom.json');const b=require('/tmp/bottom-before.json');const same=a.cycle.prob===b.cycle.prob&&a.cycle.n===b.cycle.n&&JSON.stringify(a.cycle.ci)===JSON.stringify(b.cycle.ci)&&a.swing.prob===b.swing.prob&&a.swing.n===b.swing.n;console.log('cycle prob/n:',a.cycle.prob,a.cycle.n,'| swing:',a.swing.prob,a.swing.n);console.log('signalHistory len:',b.signalHistory.length,'->',a.signalHistory.length);console.log('prob/ci/n unchanged:',same);process.exit(same?0:1);"
```
Expected: prob/ci/n không đổi; `signalHistory len` tăng ~3x.

- [ ] **Step 6: Xác nhận timeline phủ mọi phiên + ngày cụ thể tra được**

```bash
npx tsx -e "const t=require('./public/data/timeline.json');const p=t.points;console.log('points:',p.length);const has=(d)=>p.some(x=>x.date===d);console.log('Có 2026-06-10:',has('2026-06-10'));console.log('Có 2026-06-11:',has('2026-06-11'));"
```
Expected: `points` tăng ~3x (≈4200+); nếu 10/06 & 11/06 là phiên giao dịch (T2–T6) trong dữ liệu thì `true`. (Cuối tuần T7/CN vẫn không có — đúng thiết kế.)

- [ ] **Step 7: Commit data tái sinh**

```bash
git add public/data/
git commit -m "chore(data): tái sinh timeline mỗi phiên; backtest buckets + bottom prob/ci/n giữ nguyên"
```

---

## Self-Review checklist (đã chạy)

- **Spec coverage:** tách backtest (Task 1) ✓, tách bottom (Task 2) ✓, sửa POINTS_PER_MONTH (Task 3) ✓, verify backtest.json không đổi + ngày tra được (Task 4) ✓.
- **Placeholder scan:** mọi step có code/lệnh cụ thể + giá trị golden thật (216/644/94/78.7/95/100/844) đặc trưng hóa từ engine hiện tại. Không TBD.
- **Type consistency:** `evalAt` trả `{point: TimelinePoint; zone: Zone}`; `evalRow` trả `HistRow`; `buildTier` giữ khóa trả về `currentDrivers`. Con trỏ `dxyPtr`...`gprPtr` reset giữa hai lưới — khớp khai báo backtest.ts:53-57.
