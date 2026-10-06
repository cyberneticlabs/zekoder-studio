import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { ORG_NAME, reportDaysSchema } from "../shared/reports.js";
import { errorText } from "../shared/errors.js";
import { runReport } from "./org-health-cli.js";

const HOST = "127.0.0.1";
const FIRST_PORT = 47823;
const LAST_PORT = 47832;
const REPORT_IDLE_MS = 5 * 60_000;

let state: { server: Server; port: number; token: string; idle: NodeJS.Timeout } | null = null;
let starting: Promise<{ port: number; token: string }> | null = null;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function idleTimer(): NodeJS.Timeout {
  const timer = setTimeout(disposeReportServer, REPORT_IDLE_MS);
  timer.unref();
  return timer;
}

function touch(): void {
  if (!state) return;
  clearTimeout(state.idle);
  state.idle = idleTimer();
}

/** Starts the local report service on the first free port in 47823..47832, or reuses it. */
export function ensureReportServer(): Promise<{ port: number; token: string }> {
  if (state) {
    touch();
    return Promise.resolve({ port: state.port, token: state.token });
  }
  starting ??= start().finally(() => {
    starting = null;
  });
  return starting;
}

async function start(): Promise<{ port: number; token: string }> {
  const token = randomBytes(16).toString("hex");
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    const server = createServer((req, res) => void handle(req.url ?? "", token, res));
    try {
      await listen(server, port);
    } catch (error) {
      server.close();
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") continue;
      throw error;
    }
    state = { server, port, token, idle: idleTimer() };
    return { port, token };
  }
  throw new Error(`No free port for the report service in ${FIRST_PORT}-${LAST_PORT}.`);
}

export function disposeReportServer(): void {
  if (!state) return;
  clearTimeout(state.idle);
  state.server.close();
  state.server.closeAllConnections();
  state = null;
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
}

async function handle(rawUrl: string, token: string, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(rawUrl, `http://${HOST}`);
    if (url.searchParams.get("token") !== token) return notFound(res);
    if (url.pathname === "/heartbeat") {
      touch();
      res.writeHead(204).end();
      return;
    }
    const match = /^\/report\/([^/]+)$/.exec(url.pathname);
    if (!match) return notFound(res);
    const org = decodeURIComponent(match[1]);
    const daysParam = url.searchParams.get("days") ?? "";
    const days = /^\d+$/.test(daysParam) ? Number(daysParam) : NaN;
    if (!ORG_NAME.test(org) || !reportDaysSchema.safeParse(days).success) return notFound(res);
    touch();
    const files = await runReport(org, days);
    const html = await readFile(files.html, "utf8");
    const beat = `<script>setInterval(function(){fetch("/heartbeat?token=${token}")},30000)</script>`;
    const at = html.lastIndexOf("</body>");
    const body = at === -1 ? html + beat : html.slice(0, at) + beat + html.slice(at);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(body);
  } catch (error) {
    const message = errorText(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end(message);
  }
}
