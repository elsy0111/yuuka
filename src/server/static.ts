import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import { writeStaticHeaders } from "./http.js";

const PUBLIC_DIR = path.resolve(process.cwd(), "src", "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = req.url === "/" || !req.url ? "/index.html" : req.url;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, urlPath));

  if (!resolvedPath.startsWith(PUBLIC_DIR + path.sep) && resolvedPath !== PUBLIC_DIR) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    writeStaticHeaders(res, 200, contentType);
    fs.createReadStream(resolvedPath).pipe(res);
  });
}
