/**
 * Đồng bộ giá SJC từ thiết bị local (IP nhà, không bị Cloudflare/datacenter chặn
 * như GitHub Actions runner — xem CLAUDE.md "Data sources"). Chạy định kỳ qua
 * Task Scheduler (Windows) / termux-job-scheduler (Android), độc lập trên nhiều
 * thiết bị: pull trước, backfill (idempotent, chỉ lấp ngày thiếu), push với retry
 * khi bị thiết bị khác đẩy trước.
 *
 * Chạy tay: npx tsx scripts/sync-vn-gold.ts
 */
import { execSync } from "node:child_process";
import { hostname } from "node:os";

// Chạy từ thư mục gốc repo (Task Scheduler set "Start in"; Termux cd trước khi chạy).
const REPO_ROOT = process.cwd();
const VN_HISTORY_PATH = "public/data/history/vn-gold.json";

function run(cmd: string): string {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function tryRun(cmd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: run(cmd) };
  } catch (e) {
    const out = e instanceof Error && "stderr" in e ? String((e as { stderr?: unknown }).stderr) : String(e);
    return { ok: false, out };
  }
}

/** fetch + rebase tường minh thay vì `git pull --rebase` — trên máy có nhiều local
 *  branch khác, `pull --rebase` từng lỗi "Cannot rebase onto multiple branches". */
function pullRebase(): { ok: boolean; out: string } {
  const fetch = tryRun("git fetch origin main");
  if (!fetch.ok) return fetch;
  return tryRun("git rebase origin/main");
}

function hasStagedChanges(): boolean {
  try {
    run(`git diff --cached --quiet -- ${VN_HISTORY_PATH}`);
    return false; // exit 0 = no diff
  } catch {
    return true; // exit 1 = has diff
  }
}

async function main() {
  console.log(`[sync-vn-gold] ${new Date().toISOString()} bắt đầu trên ${hostname()}`);

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

  run(`git add ${VN_HISTORY_PATH}`);
  if (!hasStagedChanges()) {
    console.log("[sync-vn-gold] không có gì mới để commit — đã đủ dữ liệu.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  run(`git commit -m "data: dong bo gia SJC (${hostname()}) ${stamp} UTC"`);

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

main();
