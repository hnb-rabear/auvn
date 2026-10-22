import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Tái hiện bước "Commit updated data" của workflow: Actions commit dữ liệu, rồi
 * `git pull --rebase -X <strategy> origin main` trên một origin mà máy nhà vừa push.
 * Khi rebase, `ours` = upstream (máy nhà), `theirs` = commit đang replay (Actions).
 */
const WORKFLOW = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-and-deploy.yml"), "utf8");
const strategy = /git pull --rebase -X (\w+) origin main/.exec(WORKFLOW)?.[1];

describe("workflow rebase strategy", () => {
  let dir: string;
  const sh = (cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: "pipe" }).toString();
  const cfg = "-c user.name=t -c user.email=t@t -c commit.gpgsign=false";
  const row = (ring: string) => `[\n {"date":"2026-10-22","ringSell":${ring}}\n]\n`;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rebase-"));
    sh("git init -q --bare -b main origin.git", dir);
    sh("git clone -q origin.git home", dir);
    const home = path.join(dir, "home");
    fs.writeFileSync(path.join(home, "vn.json"), row("null"));
    sh("git symbolic-ref HEAD refs/heads/main", home); // clone repo rỗng: nhánh chưa sinh
    sh(`git add vn.json && git ${cfg} commit -qm base && git push -q origin main`, home);
    sh("git clone -q origin.git actions", dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("dòng máy nhà (có giá nhẫn) sống sót khi Actions rebase lên trên", () => {
    const home = path.join(dir, "home");
    const actions = path.join(dir, "actions");
    // Actions: cron fetch qua cafef, không có nhẫn
    fs.writeFileSync(path.join(actions, "vn.json"), row('null,"sjc":142300000'));
    sh(`git add vn.json && git ${cfg} commit -qm data`, actions);
    // Máy nhà push trước: có giá nhẫn BTMC
    fs.writeFileSync(path.join(home, "vn.json"), row("145400000"));
    sh(`git add vn.json && git ${cfg} commit -qm home && git push -q origin main`, home);
    // Bước workflow
    sh(`git ${cfg} pull -q --rebase -X ${strategy} origin main`, actions);
    expect(fs.readFileSync(path.join(actions, "vn.json"), "utf8")).toContain("145400000");
  });
});
