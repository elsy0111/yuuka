import type http from "node:http";

export interface RouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  parsedUrl: URL;
  pathname: string;
  method: string | undefined;
}

export type RouteHandler = (ctx: RouteContext) => Promise<boolean> | boolean;
