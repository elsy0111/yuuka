import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const remote = workflow.match(/<<'REMOTE'\n([\s\S]*?)\n\s*REMOTE/)[1].replace(/^ {10}/gm, "");

for (const scenario of ["success", "install-failure", "health-failure"]) {
  test(`deployment ${scenario} preserves runtime and persistent data`, () => {
    const root = mkdtempSync(path.join(tmpdir(), "yuuka-deploy-test-"));
    const app = path.join(root, "app");
    const bin = path.join(root, "bin");
    const stage = path.join(app, ".deploy-staging", "test-sha");
    const put = (name, text) => {
      mkdirSync(path.dirname(name), { recursive: true });
      writeFileSync(name, text);
    };
    const command = (name, script) => {
      put(path.join(bin, name), `#!/bin/sh\n${script}\n`);
      execFileSync("chmod", ["+x", path.join(bin, name)]);
    };
    try {
      put(path.join(app, "dist/index.js"), "old-build");
      put(path.join(app, "src/public/index.html"), "old-ui");
      put(path.join(app, "package.json"), "old-manifest");
      put(path.join(app, "yarn.lock"), "old-lock");
      put(path.join(app, "node_modules/dependency.txt"), "old-dependency");
      put(path.join(app, ".yarn/install-state.gz"), "old-install-state");
      put(path.join(app, "data/keep.db"), "persistent-data");
      put(path.join(app, ".env"), "persistent-env");
      put(path.join(app, "config.yaml"), "persistent-config");
      put(path.join(app, ".git/keep"), "persistent-git");
      put(path.join(stage, "dist/index.js"), "new-build");
      put(path.join(stage, "src/public/index.html"), "new-ui");
      put(path.join(stage, "package.json"), "new-manifest");
      put(path.join(stage, "yarn.lock"), "new-lock");
      put(path.join(stage, ".yarnrc.yml"), "yarnPath: .yarn/releases/yarn.cjs");
      put(path.join(stage, ".yarn/releases/yarn.cjs"), "test-yarn");
      put(path.join(stage, "scripts/checkhealth.mjs"), "test-health");
      command("git", "exit 0");
      command("pm2", "exit 0");
      command("yarn", scenario === "install-failure" ? "exit 1" : "exit 0");
      command("sudo", "exit 0");
      command("systemctl", "exit 0");
      command(
        "node",
        scenario === "health-failure"
          ? 'case "$1" in scripts/checkhealth.mjs) exit 1;; *) exit 0;; esac'
          : "exit 0",
      );
      command("sleep", "exit 0");
      const result = spawnSync("bash", ["-s"], {
        input: remote,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          DEPLOY_PATH: app,
          DEPLOY_SERVICE: "yuuka-test",
          NODE_BIN: path.join(bin, "node"),
          PM2_BIN: path.join(bin, "pm2"),
          RELEASE_SHA: "test-sha",
        },
      });
      assert.equal(result.status, scenario === "success" ? 0 : 1, result.stderr);
      assert.equal(
        readFileSync(path.join(app, "dist/index.js"), "utf8"),
        scenario === "success" ? "new-build" : "old-build",
      );
      assert.equal(
        readFileSync(path.join(app, "src/public/index.html"), "utf8"),
        scenario === "success" ? "new-ui" : "old-ui",
      );
      assert.equal(
        readFileSync(path.join(app, "package.json"), "utf8"),
        scenario === "success" ? "new-manifest" : "old-manifest",
      );
      for (const [name, text] of [
        ["data/keep.db", "persistent-data"],
        [".env", "persistent-env"],
        ["config.yaml", "persistent-config"],
        [".git/keep", "persistent-git"],
      ]) {
        assert.equal(readFileSync(path.join(app, name), "utf8"), text);
      }
      if (scenario !== "success") {
        assert.equal(
          readFileSync(path.join(app, "node_modules/dependency.txt"), "utf8"),
          "old-dependency",
        );
        assert.equal(
          readFileSync(path.join(app, ".yarn/install-state.gz"), "utf8"),
          "old-install-state",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
