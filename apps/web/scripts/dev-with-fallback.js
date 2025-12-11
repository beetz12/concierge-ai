#!/usr/bin/env node
import { spawn } from "child_process";
import { createServer } from "net";

const BASE_PORT = parseInt(process.env.PORT || "3000", 10);
const MAX_RETRIES = 10;

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "0.0.0.0");
  });
}

/**
 * Find the next available port starting from basePort
 */
async function findAvailablePort(basePort, maxRetries) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = basePort + attempt;
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
  }
  return null;
}

async function main() {
  const port = await findAvailablePort(BASE_PORT, MAX_RETRIES);

  if (!port) {
    console.error(
      `❌ Could not find an available port after ${MAX_RETRIES} attempts`
    );
    process.exit(1);
  }

  if (port !== BASE_PORT) {
    console.log(`📍 Port ${BASE_PORT} was in use, using ${port} instead\n`);
  }

  const child = spawn("npx", ["next", "dev", "--port", port.toString()], {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}

main();
