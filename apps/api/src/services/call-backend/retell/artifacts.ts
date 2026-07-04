/**
 * Durable persistence for Retell call artifacts.
 *
 * Retell recording URLs expire shortly after a call ends, so artifacts
 * (recording, transcript, raw call object) are copied out immediately:
 * - production: private Supabase storage bucket `call-artifacts`;
 * - DEMO_MODE (or no Supabase client): local directory fallback.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "../../../config/demo.js";

export const CALL_ARTIFACTS_BUCKET = "call-artifacts";

export const DEFAULT_LOCAL_ARTIFACTS_DIR = ".call-artifacts";

export interface ArtifactFile {
  /** File name within the call's folder, e.g. "recording.wav". */
  name: string;
  data: string | Uint8Array;
  contentType: string;
}

export interface RetellArtifactStore {
  /**
   * Persist files for a call and return a map of file name -> durable ref
   * (a `supabase://bucket/path` URI or an absolute local path).
   */
  save(callId: string, files: ArtifactFile[]): Promise<Record<string, string>>;
}

/** Persists artifacts to the private Supabase `call-artifacts` bucket. */
export class SupabaseArtifactStore implements RetellArtifactStore {
  private bucketEnsured = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string = CALL_ARTIFACTS_BUCKET,
  ) {}

  async save(
    callId: string,
    files: ArtifactFile[],
  ): Promise<Record<string, string>> {
    await this.ensureBucket();
    const refs: Record<string, string> = {};
    for (const file of files) {
      const objectPath = `${callId}/${file.name}`;
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(objectPath, file.data, {
          contentType: file.contentType,
          upsert: true,
        });
      if (error) {
        throw new Error(
          `Failed to persist call artifact ${objectPath} to bucket ` +
            `${this.bucket}: ${error.message}`,
        );
      }
      refs[file.name] = `supabase://${this.bucket}/${objectPath}`;
    }
    return refs;
  }

  /**
   * Idempotently create the bucket. Creation errors (e.g. it already
   * exists) are ignored; real problems surface as upload failures.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) {
      return;
    }
    try {
      await this.supabase.storage.createBucket(this.bucket, { public: false });
    } catch {
      // Ignore: bucket likely exists already.
    }
    this.bucketEnsured = true;
  }
}

/** Local-directory fallback used in DEMO_MODE or when Supabase is absent. */
export class LocalDirArtifactStore implements RetellArtifactStore {
  constructor(private readonly baseDir: string) {}

  async save(
    callId: string,
    files: ArtifactFile[],
  ): Promise<Record<string, string>> {
    const dir = path.resolve(this.baseDir, callId);
    await mkdir(dir, { recursive: true });
    const refs: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      await writeFile(filePath, file.data);
      refs[file.name] = filePath;
    }
    return refs;
  }
}

export interface CreateArtifactStoreOptions {
  supabase?: SupabaseClient | null;
  /** Defaults to the DEMO_MODE env toggle. */
  demoMode?: boolean;
  /** Base directory for the local fallback (default: ./.call-artifacts). */
  localDir?: string;
}

export function createArtifactStore(
  options: CreateArtifactStoreOptions,
): RetellArtifactStore {
  const demoMode = options.demoMode ?? isDemoMode();
  if (!demoMode && options.supabase) {
    return new SupabaseArtifactStore(options.supabase);
  }
  const baseDir =
    options.localDir ?? path.join(process.cwd(), DEFAULT_LOCAL_ARTIFACTS_DIR);
  return new LocalDirArtifactStore(baseDir);
}
