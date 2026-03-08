if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  dotenv.config({
    path: new URL("../.env", import.meta.url),
  });
}

import { buildVoiceAgentServer } from "./server.js";

const { config, server } = buildVoiceAgentServer();

let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

const start = async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(
    `Voice agent listening on http://${config.host}:${config.port} (runtime=${config.callRuntimeProvider})`,
  );
};

const shutdown = async (signal: NodeJS.Signals) => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  console.log(`Voice agent received ${signal}; draining connections`);

  shutdownPromise = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      console.log("Voice agent shutdown complete");
      resolve();
    });
  });

  return shutdownPromise;
};

const registerShutdownHandler = (signal: NodeJS.Signals) => {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error("Voice agent shutdown failed", error);
        process.exit(1);
      });
  });
};

registerShutdownHandler("SIGINT");
registerShutdownHandler("SIGTERM");

process.on("uncaughtException", (error) => {
  console.error("Voice agent uncaught exception", error);
  process.exitCode = 1;
  if (!isShuttingDown) {
    void shutdown("SIGTERM");
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("Voice agent unhandled rejection", reason);
  process.exitCode = 1;
  if (!isShuttingDown) {
    void shutdown("SIGTERM");
  }
});

await start();
