import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  providerIntelBenchmarkScenarios,
} from "./fixtures/provider-intel-benchmark-scenarios.js";
import { runProviderIntelBenchmark } from "../scripts/provider-intel-benchmark.js";

// Snapshot at module load: sibling test files mutate process.env.GEMINI_API_KEY,
// so read it once here to keep the skip decision deterministic (skip in CI, where
// the key is absent from the start).
const SKIP_GEMINI = !process.env.GEMINI_API_KEY && "no GEMINI_API_KEY";

for (const scenario of providerIntelBenchmarkScenarios.filter(
  (item) => item.expectedTopProviders.length > 0,
)) {
  test(`provider-intel benchmark snapshot: ${scenario.id}`, {
    skip: SKIP_GEMINI,
  }, async () => {
    const outDir = await mkdtemp(join(tmpdir(), "provider-intel-benchmark-"));
    const outputPath = join(outDir, `${scenario.id}.json`);
    await runProviderIntelBenchmark({
      scenarioId: scenario.id,
      mode: "snapshot",
      outputPath,
    });

    const report = JSON.parse(await readFile(outputPath, "utf8")) as {
      topProviders: Array<{ name: string }>;
      finalists: Array<{ name: string }>;
      pipelineStages: Array<{ name: string; reasoning?: string }>;
    };

    assert.deepEqual(
      report.topProviders.map((provider) => provider.name),
      scenario.expectedTopProviders,
    );
    assert.deepEqual(
      report.finalists.map((provider) => provider.name),
      scenario.expectedFinalists,
    );

    const reviewStage = report.pipelineStages.find(
      (stage) => stage.name === "gemini_review_analysis",
    );
    assert.match(reviewStage?.reasoning ?? "", /Deterministic review analysis/i);
  });
}
