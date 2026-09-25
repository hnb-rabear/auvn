import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runBackfill } from "../scripts/backfill-vn";
import { runSync, HISTORY_PATHS, type CommandRunner } from "../scripts/sync-vn-gold";
import type { VnGoldEntry } from "../src/lib/types";
import type { RingGoldDay } from "../src/lib/ring-gold";

function buildBtmcApiPayload(
  buy = 14250000,
  sell = 14650000,
  dateStr = "15/09/2026 08:50"
): string {
  return JSON.stringify({
    DataList: {
      Data: [
        {
          "@n_1": "NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)",
          "@h_1": "999.9",
          "@pb_1": String(buy),
          "@ps_1": String(sell),
          "@d_1": dateStr,
        },
      ],
    },
  });
}

describe("runBackfill", () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  async function runBackfillFast(dir: string): Promise<void> {
    const p = runBackfill(dir);
    let done = false;
    p.then(
      () => {
        done = true;
      },
      () => {
        done = true;
      }
    );
    while (!done) {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
    }
    await p;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ring-sync-test-"));
    fs.mkdirSync(path.join(tmpDir, "public", "data", "history"), { recursive: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z")); // VN date: 2026-09-15
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Default offline test fetch reject")))
    );
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("good ring despite other sources failed", async () => {
    const btmcPayload = buildBtmcApiPayload();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("api.btmc.vn")) {
          return Promise.resolve(new Response(btmcPayload, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await runBackfillFast(tmpDir);

    expect(process.exitCode).toBeUndefined();

    const ringFile = path.join(tmpDir, "public", "data", "history", "ring-gold.json");
    expect(fs.existsSync(ringFile)).toBe(true);

    const ringData: RingGoldDay[] = JSON.parse(fs.readFileSync(ringFile, "utf8"));
    expect(ringData.length).toBe(1);
    expect(ringData[0].date).toBe("2026-09-15");
    expect(ringData[0].quotes.btmc).toBeDefined();
    expect(ringData[0].quotes.btmc?.buy).toBe(142_500_000);
    expect(ringData[0].quotes.btmc?.sell).toBe(146_500_000);

    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    expect(fs.existsSync(vnFile)).toBe(false);

    // Assert warnings on partial failure
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("cafef fetch failed:"),
      expect.anything()
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("xau fetch failed:"),
      expect.anything()
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("fx fetch failed:"),
      expect.anything()
    );
  });

  it("SJC-only preserves legacy ring atomically", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    const initialHistory: VnGoldEntry[] = [
      {
        date: "2026-09-15",
        sjcBuy: 80_000_000,
        sjcSell: 82_000_000,
        ringBuy: 74_000_000,
        ringSell: 75_000_000,
        usdVnd: 25400,
        xauUsd: 2500,
        premiumPct: 5.2,
      },
    ];
    fs.writeFileSync(vnFile, JSON.stringify(initialHistory, null, 1));

    // SJC XML with buy=81000, sell=83000 (VND/lượng after normalize: 81M/83M)
    const sjcXml = `
      <root>
        <city name="Hồ Chí Minh">
          <item buy="81000" sell="83000" type="VÀNG SJC 1L - 10L" />
        </city>
      </root>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("sjc.com.vn") || urlStr.includes("tygiavang.xml")) {
          return Promise.resolve(new Response(sjcXml, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await runBackfillFast(tmpDir);

    const updatedHistory: VnGoldEntry[] = JSON.parse(fs.readFileSync(vnFile, "utf8"));
    const todayRow = updatedHistory.find((r) => r.date === "2026-09-15");
    expect(todayRow).toBeDefined();
    expect(todayRow?.sjcBuy).toBe(81_000_000);
    expect(todayRow?.sjcSell).toBe(83_000_000);
    // Legacy ring buy/sell preserved atomically
    expect(todayRow?.ringBuy).toBe(74_000_000);
    expect(todayRow?.ringSell).toBe(75_000_000);
  });

  it("incomplete ring quote does not splice with old quote", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    const initialHistory: VnGoldEntry[] = [
      {
        date: "2026-09-15",
        sjcBuy: 80_000_000,
        sjcSell: 82_000_000,
        ringBuy: 74_000_000,
        ringSell: 75_000_000,
        usdVnd: 25400,
        xauUsd: 2500,
        premiumPct: 5.2,
      },
    ];
    fs.writeFileSync(vnFile, JSON.stringify(initialHistory, null, 1));

    // Response has incomplete ring quote: buy is valid, sell is 0 (invalid)
    const sjcXml = `
      <root>
        <city name="Hồ Chí Minh">
          <item buy="81000" sell="83000" type="VÀNG SJC 1L - 10L" />
          <item buy="77000" sell="0" type="NHẪN SJC 99,99 1 CHỈ" />
        </city>
      </root>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("sjc.com.vn") || urlStr.includes("tygiavang.xml")) {
          return Promise.resolve(new Response(sjcXml, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await runBackfillFast(tmpDir);

    const updatedHistory: VnGoldEntry[] = JSON.parse(fs.readFileSync(vnFile, "utf8"));
    const todayRow = updatedHistory.find((r) => r.date === "2026-09-15");
    expect(todayRow?.sjcBuy).toBe(81_000_000);
    // Preserves the existing atomic pair, not splicing 77_000_000 with 75_000_000
    expect(todayRow?.ringBuy).toBe(74_000_000);
    expect(todayRow?.ringSell).toBe(75_000_000);
  });

  it("old rows intact", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    const initialHistory: VnGoldEntry[] = [
      {
        date: "2026-09-10",
        sjcBuy: 79_000_000,
        sjcSell: 81_000_000,
        ringBuy: 73_000_000,
        ringSell: 74_000_000,
        usdVnd: 25400,
        xauUsd: 2480,
        premiumPct: 4.8,
      },
    ];
    fs.writeFileSync(vnFile, JSON.stringify(initialHistory, null, 1));

    const cafefPayload = JSON.stringify({
      Data: {
        goldPriceWorldHistories: [
          {
            name: "SJC",
            buyPrice: 70, // Conflicting prices for already existing day
            sellPrice: 72,
            createdAt: "2026-09-10T08:00:00Z",
          },
          {
            name: "SJC",
            buyPrice: 79.5, // New day
            sellPrice: 81.5,
            createdAt: "2026-09-11T08:00:00Z",
          },
        ],
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("cafef.vn")) {
          return Promise.resolve(new Response(cafefPayload, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await runBackfillFast(tmpDir);

    const updatedHistory: VnGoldEntry[] = JSON.parse(fs.readFileSync(vnFile, "utf8"));
    // 2026-09-10 (old), 2026-09-11 (new backfill), and 2026-09-15 (today's live from cafef)
    expect(updatedHistory.length).toBe(3);

    const oldRow = updatedHistory.find((r) => r.date === "2026-09-10");
    expect(oldRow?.sjcBuy).toBe(79_000_000);
    expect(oldRow?.sjcSell).toBe(81_000_000);
    expect(oldRow?.ringBuy).toBe(73_000_000);
    expect(oldRow?.ringSell).toBe(74_000_000);

    const newRow = updatedHistory.find((r) => r.date === "2026-09-11");
    expect(newRow?.sjcBuy).toBe(79_500_000);
    expect(newRow?.sjcSell).toBe(81_500_000);
    expect(newRow?.backfilled).toBe(true);
  });

  it("fs failure stop: corrupt ring-gold.json stops with error", async () => {
    const ringFile = path.join(tmpDir, "public", "data", "history", "ring-gold.json");
    fs.writeFileSync(ringFile, "{ corrupt json");

    await expect(runBackfillFast(tmpDir)).rejects.toThrow(/Corrupt JSON/i);
  });

  it("fs failure stop: corrupt vn-gold.json stops with error", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    fs.writeFileSync(vnFile, "{ corrupt json");

    const btmcPayload = buildBtmcApiPayload();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("api.btmc.vn")) {
          return Promise.resolve(new Response(btmcPayload, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await expect(runBackfillFast(tmpDir)).rejects.toThrow(/Corrupt JSON/i);

    // ring-gold.json must NOT be written when vn-gold.json is corrupt
    const ringFile = path.join(tmpDir, "public", "data", "history", "ring-gold.json");
    expect(fs.existsSync(ringFile)).toBe(false);
  });

  it("bad ring history writes SJC data before throwing at end", async () => {
    const ringFile = path.join(tmpDir, "public", "data", "history", "ring-gold.json");
    fs.writeFileSync(ringFile, "{ corrupt json");

    const cafefPayload = JSON.stringify({
      Data: {
        goldPriceWorldHistories: [
          {
            name: "SJC",
            buyPrice: 80,
            sellPrice: 82,
            createdAt: "2026-09-15T08:00:00Z",
          },
        ],
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("cafef.vn")) {
          return Promise.resolve(new Response(cafefPayload, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await expect(runBackfillFast(tmpDir)).rejects.toThrow(/Corrupt JSON in ring gold history/i);

    // SJC data was landed on disk despite ring gold rejection
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    expect(fs.existsSync(vnFile)).toBe(true);
    const vnData: VnGoldEntry[] = JSON.parse(fs.readFileSync(vnFile, "utf8"));
    expect(vnData.length).toBe(1);
    expect(vnData[0].sjcBuy).toBe(80_000_000);
    expect(vnData[0].sjcSell).toBe(82_000_000);
  });

  it("all sources unavailable throws error", async () => {
    // Default fetch mock already rejects
    await expect(runBackfillFast(tmpDir)).rejects.toThrow(
      /All gold price sources failed/i
    );
  });

  it("rejects when only legacy ring is returned without sjcSell and no branded ring collected", async () => {
    // live returns ring only, sjcSell is null
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("api.btmc.vn") && urlStr.includes("getpricebtmc")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                DataList: {
                  Data: [
                    {
                      "@n_1": "NHẪN TRÒN TRƠN",
                      "@pb_1": "7400000",
                      "@ps_1": "7500000",
                    },
                  ],
                },
              }),
              { status: 200 }
            )
          );
        }
        return Promise.reject(new Error("fetch reject"));
      })
    );

    // collector for branded ring throws/fails because no Vàng Rồng Thăng Long
    await expect(runBackfillFast(tmpDir)).rejects.toThrow(
      /All gold price sources failed/i
    );
  });

  // Tỷ giá của MỘT ngày chỉ ghi MỘT LẦN: cron lấy giá bán Vietcombank, backfill lấy Yahoo
  // VND=X (lệch ~1%). Trước 2026-09-25 bên chạy sau ghi đè bên trước nên premium CÙNG một
  // ngày nhảy qua lại (đo được 15/09: 6,66 → 7,47 → 6,4).
  it("KHÔNG ghi đè tỷ giá đã có của chính ngày đó, dù fetch mới thành công", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    fs.writeFileSync(
      vnFile,
      JSON.stringify(
        [
          {
            date: "2026-09-15",
            sjcBuy: 80_000_000,
            sjcSell: 82_000_000,
            ringBuy: null,
            ringSell: null,
            usdVnd: 26180, // cron đã ghi (Vietcombank)
            xauUsd: 2500,
            premiumPct: 5.2,
          },
        ],
        null,
        1
      )
    );

    const sjcXml = `<root><city name="Hồ Chí Minh"><item buy="84000" sell="86000" type="VÀNG SJC 1L - 10L" /></city></root>`;
    const yahooFx = {
      chart: {
        result: [
          { timestamp: [Math.floor(Date.parse("2026-09-15T00:00:00Z") / 1000)], indicators: { quote: [{ close: [25920] }] } },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("sjc.com.vn") || u.includes("tygiavang.xml"))
          return Promise.resolve(new Response(sjcXml, { status: 200 }));
        if (u.includes("VND=X"))
          return Promise.resolve(new Response(JSON.stringify(yahooFx), { status: 200 }));
        return Promise.reject(new Error(`no mock for ${u}`));
      })
    );

    await runBackfillFast(tmpDir);

    const row = (JSON.parse(fs.readFileSync(vnFile, "utf8")) as VnGoldEntry[]).find(
      (r) => r.date === "2026-09-15"
    );
    expect(row?.usdVnd).toBe(26180); // KHÔNG phải 25920 của Yahoo
  });

  it("preserves same-day valid FX/XAU when fetch fails, recomputes premium from matching inputs", async () => {
    const vnFile = path.join(tmpDir, "public", "data", "history", "vn-gold.json");
    const initialHistory: VnGoldEntry[] = [
      {
        date: "2026-09-15",
        sjcBuy: 80_000_000,
        sjcSell: 82_000_000,
        ringBuy: 74_000_000,
        ringSell: 75_000_000,
        usdVnd: 25400,
        xauUsd: 2500,
        premiumPct: 5.2,
      },
    ];
    fs.writeFileSync(vnFile, JSON.stringify(initialHistory, null, 1));

    const sjcXml = `
      <root>
        <city name="Hồ Chí Minh">
          <item buy="84000" sell="86000" type="VÀNG SJC 1L - 10L" />
        </city>
      </root>
    `;

    // FX and XAU fail, SJC succeeds
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes("sjc.com.vn") || urlStr.includes("tygiavang.xml")) {
          return Promise.resolve(new Response(sjcXml, { status: 200 }));
        }
        return Promise.reject(new Error(`Network error for ${urlStr}`));
      })
    );

    await runBackfillFast(tmpDir);

    const updatedHistory: VnGoldEntry[] = JSON.parse(fs.readFileSync(vnFile, "utf8"));
    const todayRow = updatedHistory.find((r) => r.date === "2026-09-15");
    expect(todayRow?.sjcBuy).toBe(84_000_000);
    expect(todayRow?.sjcSell).toBe(86_000_000);
    // Preserved FX and XAU
    expect(todayRow?.usdVnd).toBe(25400);
    expect(todayRow?.xauUsd).toBe(2500);

    // World price: (2500 / 31.1034768) * 37.5 * 25400 = 76,566,996.14
    // Premium: (86,000,000 - 76,566,996.14) / 76,566,996.14 = 12.33%
    expect(todayRow?.premiumPct).not.toBe(5.2); // Not the stale premium!
    expect(todayRow?.premiumPct).toBe(12.33);
  });
});

describe("runSync", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ring-sync-wrapper-"));
    fs.mkdirSync(path.join(tmpDir, "public", "data", "history"), { recursive: true });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("sync preflight refuses git add and commit when staged files exist in index", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd.includes("diff --cached --name-only")) {
        return "src/components/Dashboard.tsx\n";
      }
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    // Fetch, rebase, and backfill run so data is collected to disk
    expect(executed.some((c) => c.includes("fetch"))).toBe(true);
    expect(executed.some((c) => c.includes("backfill-vn.ts"))).toBe(true);
    // But staging and commit are blocked to protect user's index
    expect(executed.some((c) => c.includes("git add"))).toBe(false);
    expect(executed.some((c) => c.includes("commit"))).toBe(false);
  });

  it("sync preflight refuses when owned history paths are dirty", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd.includes("diff --cached --name-only")) {
        return "";
      }
      if (cmd.includes("git status --porcelain")) {
        return " M public/data/history/ring-gold.json\n";
      }
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    expect(executed.some((c) => c.includes("fetch") || c.includes("rebase"))).toBe(false);
  });

  it("sync preflight refuses when owned history paths are untracked", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd.includes("diff --cached --name-only")) {
        return "";
      }
      if (cmd.includes("git status --porcelain")) {
        return "?? public/data/history/ring-gold.json\n";
      }
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    expect(executed.some((c) => c.includes("fetch") || c.includes("rebase"))).toBe(false);
  });

  it("sync stops when backfill fails with non-zero exit code", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd.includes("diff --cached --name-only")) return "";
      if (cmd.includes("status --porcelain")) return "";
      if (cmd.includes("fetch")) return "";
      if (cmd.includes("rebase")) return "";
      if (cmd.includes("backfill-vn.ts")) {
        const err = new Error("Backfill failed");
        (err as unknown as { stderr: string }).stderr = "Collector failed";
        throw err;
      }
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    // Must NOT stage or commit
    expect(executed.some((c) => c.includes("git add"))).toBe(false);
    expect(executed.some((c) => c.includes("git commit"))).toBe(false);
  });

  it("sync allowlist: stages and checks exactly 2 history paths", async () => {
    // Create both history files so existsSync returns true
    fs.writeFileSync(path.join(tmpDir, "public/data/history/vn-gold.json"), "[]");
    fs.writeFileSync(path.join(tmpDir, "public/data/history/ring-gold.json"), "[]");

    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd.includes("diff --cached --name-only")) return "";
      if (cmd.includes("status --porcelain")) return "";
      if (cmd.includes("fetch")) return "";
      if (cmd.includes("rebase")) return "";
      if (cmd.includes("backfill-vn.ts")) return "ok";
      if (cmd.includes("diff --cached --quiet")) {
        // Return diff exists (exit 1)
        throw new Error("diff exists");
      }
      if (cmd.includes("commit")) return "[main 12345] committed";
      if (cmd.includes("push")) return "pushed";
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBeUndefined();

    // Check allowlist constants
    expect(HISTORY_PATHS).toEqual([
      "public/data/history/vn-gold.json",
      "public/data/history/ring-gold.json",
    ]);

    // Check git add was called exactly for the 2 allowed paths
    const addCommands = executed.filter((c) => c.startsWith("git add"));
    expect(addCommands).toEqual([
      'git add "public/data/history/vn-gold.json"',
      'git add "public/data/history/ring-gold.json"',
    ]);

    // Check git diff --cached checked exactly the 2 allowed paths
    const diffQuiet = executed.find((c) => c.includes("diff --cached --quiet"));
    expect(diffQuiet).toBe(
      'git diff --cached --quiet -- "public/data/history/vn-gold.json" "public/data/history/ring-gold.json"'
    );
  });

  it("sync refuses to run when not on main (no rebase, no commit)", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "feat/x";
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    expect(executed.some((c) => c.includes("rebase") || c.includes("commit") || c.includes("push"))).toBe(false);
  });

  it("sync aborts a conflicted rebase so the repo is not left mid-rebase", async () => {
    const executed: string[] = [];
    const mockRunner: CommandRunner = (cmd) => {
      executed.push(cmd);
      if (cmd.includes("rev-parse --abbrev-ref")) return "main";
      if (cmd === "git rebase origin/main") throw new Error("conflict");
      return "";
    };

    await runSync(tmpDir, mockRunner);

    expect(process.exitCode).toBe(1);
    expect(executed).toContain("git rebase --abort");
    expect(executed.some((c) => c.includes("backfill-vn.ts"))).toBe(false);
  });
});
