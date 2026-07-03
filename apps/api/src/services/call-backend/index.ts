import type { SupabaseClient } from "@supabase/supabase-js";
import { ContractorCallService } from "../voice/contractor-call.service.js";
import { LiveKitCallBackend } from "./livekit/livekit-call-backend.js";
import type { CallBackend, CallBackendId } from "./types.js";

export * from "./types.js";
export { LiveKitCallBackend } from "./livekit/livekit-call-backend.js";

const DEFAULT_CALL_BACKEND: CallBackendId = "livekit";

/**
 * Dependencies a backend factory needs to construct its concrete backend.
 */
export interface CallBackendDependencies {
  supabase: SupabaseClient;
}

type CallBackendFactory = (deps: CallBackendDependencies) => CallBackend;

/**
 * Registry of available call backends, keyed by {@link CallBackendId}.
 * Add new providers here to make them selectable via `CALL_BACKEND`.
 */
const registry: Record<CallBackendId, CallBackendFactory> = {
  livekit: (deps) =>
    new LiveKitCallBackend(
      new ContractorCallService({ supabase: deps.supabase }),
    ),
};

/**
 * Resolve the configured {@link CallBackendId} from the `CALL_BACKEND`
 * environment variable, defaulting to LiveKit.
 *
 * @throws if `CALL_BACKEND` is set to an unknown backend id.
 */
export function resolveCallBackendId(
  env: NodeJS.ProcessEnv = process.env,
): CallBackendId {
  const raw = env.CALL_BACKEND?.trim();
  if (!raw) {
    return DEFAULT_CALL_BACKEND;
  }

  if (raw in registry) {
    return raw as CallBackendId;
  }

  const available = Object.keys(registry).join(", ");
  throw new Error(
    `Unsupported CALL_BACKEND: ${raw}. Available backends: ${available}.`,
  );
}

/**
 * Build the call backend selected by the `CALL_BACKEND` environment variable
 * (default: livekit).
 */
export function getCallBackend(
  deps: CallBackendDependencies,
  env: NodeJS.ProcessEnv = process.env,
): CallBackend {
  const id = resolveCallBackendId(env);
  return registry[id](deps);
}
