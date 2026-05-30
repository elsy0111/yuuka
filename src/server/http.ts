import type http from "node:http";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; img-src 'self' data:; worker-src 'self'; frame-ancestors 'self';",
};

export function getRequestBody(
  req: http.IncomingMessage,
  maxBytes: number = 10 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        reject(new Error("リクエストボディが大きすぎます"));
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...SECURITY_HEADERS,
  });
  res.end(JSON.stringify(data));
}

export function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { success: false, message });
}

export function writeStaticHeaders(
  res: http.ServerResponse,
  status: number,
  contentType: string,
): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    ...SECURITY_HEADERS,
  });
}
