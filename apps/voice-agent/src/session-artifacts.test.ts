import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTranscriptFromSessionReport,
  persistSessionArtifacts,
} from "./session-artifacts.js";

test("buildTranscriptFromSessionReport formats assistant and provider turns", () => {
  const transcript = buildTranscriptFromSessionReport({
    chatHistory: {
      items: [
        {
          type: "message",
          role: "assistant",
          content: ["Hi, this is David's AI assistant calling on his behalf."],
        },
        {
          type: "message",
          role: "user",
          content: ["Yes, this is Dave's Handy Plumbing."],
        },
      ],
    },
  });

  assert.equal(
    transcript,
    [
      "Assistant: Hi, this is David's AI assistant calling on his behalf.",
      "Provider: Yes, this is Dave's Handy Plumbing.",
    ].join("\n\n"),
  );
});

test("persistSessionArtifacts writes transcript, report, and audio recording", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "voice-artifacts-"));
  const sourceAudioPath = path.join(baseDir, "source-audio.ogg");
  await writeFile(sourceAudioPath, "audio-bytes", "utf8");

  const artifacts = await persistSessionArtifacts({
    sessionId: "session_123",
    recordingsDir: path.join(baseDir, "recordings"),
    report: {
      jobId: "job_123",
      room: "room_123",
      audioRecordingPath: sourceAudioPath,
      chatHistory: {
        items: [
          {
            type: "message",
            role: "assistant",
            content: ["What is your earliest availability?"],
          },
          {
            type: "message",
            role: "user",
            content: ["Tomorrow morning."],
          },
        ],
      },
    },
  });

  assert.match(artifacts.transcriptPath, /transcript\.txt$/);
  assert.match(artifacts.sessionReportPath, /session-report\.json$/);
  assert.match(artifacts.recordingPath || "", /audio\.ogg$/);

  const transcript = await readFile(artifacts.transcriptPath, "utf8");
  const report = await readFile(artifacts.sessionReportPath, "utf8");
  const audio = await readFile(artifacts.recordingPath!, "utf8");

  assert.match(transcript, /Assistant: What is your earliest availability\?/);
  assert.match(transcript, /Provider: Tomorrow morning\./);
  assert.match(report, /job_123/);
  assert.equal(audio, "audio-bytes");
});

test("persistSessionArtifacts prefers transcriptOverride when provided", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "voice-artifacts-"));

  const artifacts = await persistSessionArtifacts({
    sessionId: "session_override",
    recordingsDir: path.join(baseDir, "recordings"),
    transcriptOverride: "Assistant: Hello\n\nProvider: Hi",
    report: {
      chatHistory: {
        items: [],
      },
    },
  });

  const transcript = await readFile(artifacts.transcriptPath, "utf8");
  assert.equal(transcript, "Assistant: Hello\n\nProvider: Hi");
});
