import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CALL_ARTIFACTS_BUCKET,
  createArtifactStore,
  LocalDirArtifactStore,
  SupabaseArtifactStore,
} from "./artifacts.js";

interface RecordedUpload {
  bucket: string;
  path: string;
  data: unknown;
  options: unknown;
}

function makeMockSupabase(uploadError: { message: string } | null = null) {
  const uploads: RecordedUpload[] = [];
  const createdBuckets: string[] = [];
  const supabase = {
    storage: {
      createBucket: async (name: string) => {
        createdBuckets.push(name);
        return { data: { name }, error: null };
      },
      from: (bucket: string) => ({
        upload: async (objectPath: string, data: unknown, options: unknown) => {
          uploads.push({ bucket, path: objectPath, data, options });
          return uploadError
            ? { data: null, error: uploadError }
            : { data: { path: objectPath }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { supabase, uploads, createdBuckets };
}

test("LocalDirArtifactStore writes files under <dir>/<callId> and returns paths", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "retell-artifacts-"));
  const store = new LocalDirArtifactStore(baseDir);

  const refs = await store.save("call_1", [
    { name: "transcript.txt", data: "Agent: Hello", contentType: "text/plain" },
    {
      name: "recording.wav",
      data: Buffer.from("RIFFfake-audio"),
      contentType: "audio/wav",
    },
  ]);

  assert.deepEqual(Object.keys(refs).sort(), ["recording.wav", "transcript.txt"]);
  assert.equal(refs["transcript.txt"], path.join(baseDir, "call_1", "transcript.txt"));
  assert.equal(await readFile(refs["transcript.txt"]!, "utf8"), "Agent: Hello");
  assert.equal(
    (await readFile(refs["recording.wav"]!)).toString(),
    "RIFFfake-audio",
  );
});

test("SupabaseArtifactStore upserts into the call-artifacts bucket", async () => {
  const { supabase, uploads, createdBuckets } = makeMockSupabase();
  const store = new SupabaseArtifactStore(supabase);

  const refs = await store.save("call_1", [
    { name: "transcript.txt", data: "Agent: Hello", contentType: "text/plain" },
    { name: "call.json", data: "{}", contentType: "application/json" },
  ]);
  await store.save("call_2", [
    { name: "call.json", data: "{}", contentType: "application/json" },
  ]);

  // Bucket creation is attempted once, idempotently.
  assert.deepEqual(createdBuckets, [CALL_ARTIFACTS_BUCKET]);
  assert.equal(uploads.length, 3);
  assert.equal(uploads[0]!.bucket, CALL_ARTIFACTS_BUCKET);
  assert.equal(uploads[0]!.path, "call_1/transcript.txt");
  assert.deepEqual(uploads[0]!.options, {
    contentType: "text/plain",
    upsert: true,
  });
  assert.deepEqual(refs, {
    "transcript.txt": `supabase://${CALL_ARTIFACTS_BUCKET}/call_1/transcript.txt`,
    "call.json": `supabase://${CALL_ARTIFACTS_BUCKET}/call_1/call.json`,
  });
});

test("SupabaseArtifactStore surfaces upload failures", async () => {
  const { supabase } = makeMockSupabase({ message: "quota exceeded" });
  const store = new SupabaseArtifactStore(supabase);
  await assert.rejects(
    store.save("call_1", [
      { name: "call.json", data: "{}", contentType: "application/json" },
    ]),
    /quota exceeded/,
  );
});

test("createArtifactStore picks the local dir under DEMO_MODE and Supabase otherwise", () => {
  const { supabase } = makeMockSupabase();
  assert.ok(
    createArtifactStore({ supabase, demoMode: true, localDir: "/tmp/x" }) instanceof
      LocalDirArtifactStore,
  );
  assert.ok(
    createArtifactStore({ supabase, demoMode: false }) instanceof
      SupabaseArtifactStore,
  );
  // No Supabase client available -> local fallback even outside demo mode.
  assert.ok(
    createArtifactStore({ demoMode: false, localDir: "/tmp/x" }) instanceof
      LocalDirArtifactStore,
  );
});
