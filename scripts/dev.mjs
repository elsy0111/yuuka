import { spawn, spawnSync } from "node:child_process";

const build = spawnSync("yarn", ["build:css"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const children = [
  spawn("yarn", ["watch:css"], { stdio: "inherit" }),
  spawn("yarn", ["tsx", "watch", "src/index.ts"], { stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}
