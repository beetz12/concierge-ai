import { z } from "zod";

const boolEnv = (defaultValue: boolean) =>
  z.preprocess(
    (value) => {
      if (value === undefined) {
        return defaultValue;
      }

      return value;
    },
    z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      return value === "true";
    }),
  );

const nonEmptyString = z.string().min(1);

const callRuntimeEnvSchema = z.object({
  CALL_RUNTIME_PROVIDER: z.enum(["livekit", "vapi"]).optional().default("livekit"),
  LIVEKIT_ENABLED: boolEnv(true),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  VOICE_AGENT_SHARED_SECRET: z.string().optional(),
  VAPI_ENABLED: boolEnv(false),
  VAPI_API_KEY: z.string().optional(),
  VAPI_PHONE_NUMBER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_PHONE_NO: z.string().optional(),
  TWILIO_VOICE_PHONE_NUMBER: z.string().optional(),
});

export type CallRuntimeProvider = "livekit" | "vapi";

export interface TwilioConfig {
  accountSid?: string;
  authToken?: string;
  smsFromNumber: string;
  voiceFromNumber: string;
  smsConfigured: boolean;
}

export interface CallRuntimeConfig {
  provider: CallRuntimeProvider;
  livekitEnabled: boolean;
  livekit: {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
    configured: boolean;
  };
  vapiEnabled: boolean;
  vapi: {
    apiKey?: string;
    phoneNumberId?: string;
    configured: boolean;
  };
  voiceAgent: {
    sharedSecret: string;
  };
  twilio: TwilioConfig;
}

let cachedConfig: CallRuntimeConfig | null = null;

function getRequiredConfig<T extends string>(
  enabled: boolean,
  value: string | undefined,
  label: T,
  issues: string[],
) {
  if (!enabled) {
    return value;
  }

  const parsed = nonEmptyString.safeParse(value);
  if (!parsed.success) {
    issues.push(label);
    return value;
  }

  return parsed.data;
}

function buildConfig(): CallRuntimeConfig {
  const env = callRuntimeEnvSchema.parse(process.env);
  const issues: string[] = [];

  const livekitSelected = env.CALL_RUNTIME_PROVIDER === "livekit";
  const vapiSelected = env.CALL_RUNTIME_PROVIDER === "vapi";

  const livekitUrl = getRequiredConfig(
    livekitSelected,
    env.LIVEKIT_URL,
    "LIVEKIT_URL",
    issues,
  );
  const livekitApiKey = getRequiredConfig(
    livekitSelected,
    env.LIVEKIT_API_KEY,
    "LIVEKIT_API_KEY",
    issues,
  );
  const livekitApiSecret = getRequiredConfig(
    livekitSelected,
    env.LIVEKIT_API_SECRET,
    "LIVEKIT_API_SECRET",
    issues,
  );

  const vapiApiKey = getRequiredConfig(
    vapiSelected || env.VAPI_ENABLED,
    env.VAPI_API_KEY,
    "VAPI_API_KEY",
    issues,
  );
  const vapiPhoneNumberId = getRequiredConfig(
    vapiSelected || env.VAPI_ENABLED,
    env.VAPI_PHONE_NUMBER_ID,
    "VAPI_PHONE_NUMBER_ID",
    issues,
  );

  if (issues.length > 0) {
    throw new Error(
      `Missing required call runtime configuration: ${issues.join(", ")}. ` +
        `Selected provider: ${env.CALL_RUNTIME_PROVIDER}.`,
    );
  }

  const smsFromNumber = env.TWILIO_PHONE_NUMBER || env.TWILIO_PHONE_NO || "";
  const voiceFromNumber = env.TWILIO_VOICE_PHONE_NUMBER || smsFromNumber;
  const voiceAgentSharedSecret =
    env.VOICE_AGENT_SHARED_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "dev-voice-agent-secret");

  if (livekitSelected && !voiceAgentSharedSecret) {
    throw new Error(
      "Missing required call runtime configuration: VOICE_AGENT_SHARED_SECRET. Selected provider: livekit.",
    );
  }

  return {
    provider: env.CALL_RUNTIME_PROVIDER,
    livekitEnabled: env.LIVEKIT_ENABLED,
    livekit: {
      url: livekitUrl,
      apiKey: livekitApiKey,
      apiSecret: livekitApiSecret,
      configured: Boolean(livekitUrl && livekitApiKey && livekitApiSecret),
    },
    vapiEnabled: env.VAPI_ENABLED,
    vapi: {
      apiKey: vapiApiKey,
      phoneNumberId: vapiPhoneNumberId,
      configured: Boolean(vapiApiKey && vapiPhoneNumberId),
    },
    voiceAgent: {
      sharedSecret: voiceAgentSharedSecret,
    },
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      smsFromNumber,
      voiceFromNumber,
      smsConfigured: Boolean(
        env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && smsFromNumber,
      ),
    },
  };
}

export function getCallRuntimeConfig(): CallRuntimeConfig {
  cachedConfig ??= buildConfig();
  return cachedConfig;
}

export function resetCallRuntimeConfigForTests() {
  cachedConfig = null;
}
