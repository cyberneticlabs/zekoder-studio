import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export interface McpServerCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd: string;
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";

/**
 * Minimal MCP stdio client: newline-delimited JSON-RPC, just enough to call the zekoder-mcp
 * server's tools. Kept dependency-free so the plugin needs no runtime install step.
 */
export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private stderrTail = "";

  constructor(private readonly server: McpServerCommand) {}

  /** Calls a tool and returns its JSON payload (zekoder-mcp answers with one JSON text block). */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };
    const text = result.content?.find((block) => block.type === "text")?.text ?? "";
    if (result.isError) throw new Error(text || `${name} failed`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${name} returned non-JSON output: ${text.slice(0, 200)}`);
    }
  }

  dispose(): void {
    this.failAll(new Error("zekoder-mcp client disposed"));
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }

  private start(): Promise<void> {
    this.ready ??= this.spawnAndInitialize().catch((error) => {
      this.dispose();
      throw error;
    });
    return this.ready;
  }

  private async spawnAndInitialize(): Promise<void> {
    const child = spawn(this.server.command, this.server.args, {
      cwd: this.server.cwd,
      env: { ...process.env, ...this.server.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;

    createInterface({ input: child.stdout }).on("line", (line) => this.onLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => this.onExit(`failed to start: ${error.message}`));
    child.on("exit", (code, signal) => this.onExit(`exited (${signal ?? code})`));

    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "paseo-zekoder", version: "0.1.0" },
    });
    this.write({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`zekoder-mcp ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  private write(message: unknown): void {
    this.child?.stdin.write(JSON.stringify(message) + "\n");
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let message: { id?: number; result?: unknown; error?: { message: string } };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  private onExit(reason: string): void {
    const detail = this.stderrTail.trim();
    this.failAll(new Error(`zekoder-mcp ${reason}${detail ? `: ${detail}` : ""}`));
    this.child = null;
    this.ready = null;
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
