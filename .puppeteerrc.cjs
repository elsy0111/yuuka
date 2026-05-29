const { execSync } = require("child_process");

function findChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("command -v chromium || command -v chromium-browser || command -v google-chrome", {
      stdio: "pipe",
    }).toString().trim().split("\n")[0];
  } catch {
    return undefined;
  }
}

module.exports = { executablePath: findChromium() };
