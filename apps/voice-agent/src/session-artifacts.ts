import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

type TranscriptMessageLike = {
  type?: string;
  role?: string;
  content?: unknown[];
  textContent?: string;
  createdAt?: number;
};

type ChatHistoryLike = {
  items?: TranscriptMessageLike[];
};

export interface SessionReportLike {
  jobId?: string;
  roomId?: string;
  room?: string;
  timestamp?: number;
  startedAt?: number;
  duration?: number;
  events?: unknown[];
  chatHistory?: ChatHistoryLike;
  audioRecordingPath?: string;
}

export interface PersistedSessionArtifacts {
  directory: string;
  transcript: string;
  transcriptPath: string;
  sessionReportPath: string;
  recordingPath?: string;
}

const DEFAULT_RECORDINGS_DIR = fileURLToPath(
  new URL("../recordings", import.meta.url),
);

const normalizeSpeaker = (role: string | undefined): string => {
  if (role === "assistant") {
    return "Assistant";
  }

  if (role === "user") {
    return "Provider";
  }

  if (role === "system" || role === "developer") {
    return "System";
  }

  return "Unknown";
};

const extractMessageText = (message: TranscriptMessageLike): string => {
  if (message.textContent && message.textContent.trim()) {
    return message.textContent.trim();
  }

  const parts = (message.content || [])
    .map((value) => {
      if (typeof value === "string") {
        return value.trim();
      }

      if (
        value &&
        typeof value === "object" &&
        "transcript" in value &&
        typeof value.transcript === "string"
      ) {
        return value.transcript.trim();
      }

      return "";
    })
    .filter(Boolean);

  return parts.join("\n").trim();
};

export const buildTranscriptFromSessionReport = (
  report: SessionReportLike,
): string => {
  const messages = (report.chatHistory?.items || []).filter(
    (item) => item.type === "message" && (item.role === "assistant" || item.role === "user"),
  );

  return messages
    .map((message) => {
      const text = extractMessageText(message);
      if (!text) {
        return null;
      }

      return `${normalizeSpeaker(message.role)}: ${text}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
};

export const persistSessionArtifacts = async (input: {
  sessionId: string;
  report: SessionReportLike;
  recordingsDir?: string;
  transcriptOverride?: string;
}): Promise<PersistedSessionArtifacts> => {
  const recordingsDir = input.recordingsDir || DEFAULT_RECORDINGS_DIR;
  const directory = path.join(recordingsDir, input.sessionId);
  const transcriptPath = path.join(directory, "transcript.txt");
  const sessionReportPath = path.join(directory, "session-report.json");

  await mkdir(directory, { recursive: true });

  const transcript =
    input.transcriptOverride?.trim() || buildTranscriptFromSessionReport(input.report);

  await writeFile(transcriptPath, transcript, "utf8");
  await writeFile(sessionReportPath, JSON.stringify(input.report, null, 2), "utf8");

  let recordingPath: string | undefined;
  if (input.report.audioRecordingPath) {
    const extension = path.extname(input.report.audioRecordingPath) || ".ogg";
    recordingPath = path.join(directory, `audio${extension}`);
    await copyFile(input.report.audioRecordingPath, recordingPath);
  }

  return {
    directory,
    transcript,
    transcriptPath,
    sessionReportPath,
    recordingPath,
  };
};
