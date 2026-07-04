import { spawn, type ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const BACKEND_PORT = 9000;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;
const HEALTH_POLL_MS = 500;
const HEALTH_TIMEOUT_MS = 15000;

// Resolve the api package directory relative to voice-mcp
// voice-mcp is at apps/voice-mcp, api is at apps/api
const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(__dirname, "../../api"); // from dist/ -> apps/api

export class BackendManager {
  private child: ChildProcess | null = null;
  private ready = false;
  private starting: Promise<void> | null = null;

  async ensureBackend(): Promise<void> {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this._start();
    return this.starting;
  }

  private async _start(): Promise<void> {
    // Check if something is already listening on the port
    if (await this.isHealthy()) {
      this.ready = true;
      console.error(
        `[backend-manager] Backend already running on port ${BACKEND_PORT}`,
      );
      return;
    }

    console.error(
      `[backend-manager] Starting backend API on port ${BACKEND_PORT}...`,
    );

    // Spawn the backend as a child process
    // Use the compiled dist/index.js
    this.child = spawn("node", ["dist/index.js"], {
      cwd: API_DIR,
      env: { ...process.env, PORT: String(BACKEND_PORT) },
      stdio: ["ignore", "pipe", "pipe"], // Don't inherit stdout (MCP uses it for JSON-RPC)
    });

    // Pipe child output to stderr so it doesn't interfere with MCP protocol
    this.child.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[api] ${data.toString()}`);
    });
    this.child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[api] ${data.toString()}`);
    });

    this.child.on("exit", (code, signal) => {
      console.error(
        `[backend-manager] Backend exited (code=${code}, signal=${signal})`,
      );
      this.ready = false;
      this.starting = null;
      this.child = null;
    });

    // Wait for health check to pass
    await this.waitForHealth();
    this.ready = true;
    console.error(
      `[backend-manager] Backend ready on port ${BACKEND_PORT}`,
    );
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return;
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
    }
    throw new Error(
      `Backend failed to start within ${HEALTH_TIMEOUT_MS}ms`,
    );
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(HEALTH_URL);
      return res.ok;
    } catch {
      return false;
    }
  }

  shutdown(): void {
    if (!this.child) return;
    console.error("[backend-manager] Shutting down backend...");
    this.child.kill("SIGTERM");

    // Force kill after 5 seconds if it hasn't exited
    const forceKillTimer = setTimeout(() => {
      if (this.child) {
        console.error("[backend-manager] Force killing backend...");
        this.child.kill("SIGKILL");
      }
    }, 5000);

    this.child.on("exit", () => {
      clearTimeout(forceKillTimer);
      this.child = null;
    });
  }
}
