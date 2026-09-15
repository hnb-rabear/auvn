/**
 * Đồng bộ giá SJC từ thiết bị local (IP nhà, không bị Cloudflare/datacenter chặn
 * như GitHub Actions runner — xem CLAUDE.md "Data sources"). Chạy định kỳ qua
 * Task Scheduler (Windows) / termux-job-scheduler (Android), độc lập trên nhiều
 * thiết bị: pull trước, backfill (idempotent, chỉ lấp ngày thiếu), push với retry
 * khi bị thiết bị khác đẩy trước.
 *
 * Chạy tay: npx tsx scripts/sync-vn-gold.ts
 */
import * as childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const HISTORY_PATHS = [
  "public/data/history/vn-gold.json",
  "public/data/history/ring-gold.json",
];

export type CommandRunner = (cmd: string, cwd: string) => string;

const defaultRun: CommandRunner = (cmd, cwd) =>
  childProcess.execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export async function runSync(
  repoRoot = process.cwd(),
  runCmd: CommandRunner = defaultRun
): Promise<void> {
  const tryRun = (cmd: string): { ok: boolean; out: string } => {
    try {
      return { ok: true, out: runCmd(cmd, repoRoot) };
    } catch (e) {
      const out =
        e instanceof Error && "stderr" in e
          ? String((e as { stderr?: unknown }).stderr)
          : String(e);
      return { ok: false, out };
    }
  };

  const pullRebase = (): { ok: boolean; out: string } => {
    const fetch = tryRun("git fetch origin main");
    if (!fetch.ok) return fetch;
    return tryRun("git rebase origin/main");
  };

  const hasStagedChanges = (): boolean => {
    try {
      const targets = HISTORY_PATHS.map((p) => `"${p}"`).join(" ");
      runCmd(`git diff --cached --quiet -- ${targets}`, repoRoot);
      return false; // exit 0 = no diff
    } catch {
      return true; // exit 1 = has diff
    }
  };

  console.log(`[sync-vn-gold] ${new Date().toISOString()} bắt đầu trên ${hostname()}`);

  // Preflight check B: Any owned history paths dirty or untracked?
  const targets = HISTORY_PATHS.map((p) => `"${p}"`).join(" ");
  const status = tryRun(`git status --porcelain -- ${targets}`);
  if (!status.ok || status.out.trim().length > 0) {
    console.error(
      `[sync-vn-gold] file đích (${HISTORY_PATHS.join(", ")}) đang có thay đổi chưa commit/untracked, dừng để tránh ghi đè:\n` +
        status.out
    );
    process.exitCode = 1;
    return;
  }

  const pull1 = pullRebase();
  if (!pull1.ok) {
    console.error("[sync-vn-gold] fetch/rebase thất bại, dừng để tránh phá git state:\n", pull1.out);
    process.exitCode = 1;
    return;
  }

  const backfill = tryRun("npx tsx scripts/backfill-vn.ts");
  console.log(backfill.out);
  if (!backfill.ok) {
    console.error("[sync-vn-gold] backfill-vn.ts lỗi, dừng.");
    process.exitCode = 1;
    return;
  }

  // Preflight check A: Any staged files in index?
  const staged = tryRun("git diff --cached --name-only");
  if (!staged.ok || staged.out.trim().length > 0) {
    console.error(
      "[sync-vn-gold] index chứa file staged sẵn trước khi sync, dừng để bảo vệ công việc người dùng:\n" +
        staged.out
    );
    process.exitCode = 1;
    return;
  }

  for (const p of HISTORY_PATHS) {
    if (existsSync(join(repoRoot, p))) {
      runCmd(`git add "${p}"`, repoRoot);
    }
  }

  if (!hasStagedChanges()) {
    console.log("[sync-vn-gold] không có gì mới để commit — đã đủ dữ liệu.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  runCmd(`git commit -m "data: dong bo gia SJC va nhan (${hostname()}) ${stamp} UTC"`, repoRoot);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const pull = pullRebase();
    if (!pull.ok) {
      console.error(`[sync-vn-gold] fetch/rebase lần ${attempt} thất bại (có thể conflict thật):\n${pull.out}`);
      console.error("[sync-vn-gold] dừng, không tự ý theirs/ours — cần xử lý tay trên thiết bị này.");
      process.exitCode = 1;
      return;
    }
    const push = tryRun("git push origin main");
    if (push.ok) {
      console.log(`[sync-vn-gold] push thành công (lần thử ${attempt}).`);
      return;
    }
    console.warn(`[sync-vn-gold] push lần ${attempt} bị từ chối (thiết bị khác vừa đẩy?), thử lại:\n${push.out}`);
  }
  console.error(`[sync-vn-gold] push thất bại sau ${MAX_ATTEMPTS} lần thử.`);
  process.exitCode = 1;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  runSync().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
