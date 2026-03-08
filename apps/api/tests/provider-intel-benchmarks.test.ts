import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  providerIntelBenchmarkScenarios,
} from "./fixtures/provider-intel-benchmark-scenarios.js";

const scriptUrl = pathToFileURL(
  resolve(process.cwd(), "scripts/provider-intel-benchmark.ts"),
).href;

for (const scenario of providerIntelBenchmarkScenarios.filter(
  (item) => item.expectedTopProviders.length > 0,
)) {
  test(`provider-intel benchmark snapshot: ${scenario.id}`, async () => {
    const outDir = await mkdtemp(join(tmpdir(), "provider-intel-benchmark-"));
    const outputPath = join(outDir, `${scenario.id}.json`);
    const previousArgv = process.argv;

    process.argv = [
      "node",
      scriptUrl,
      "--scenario",
      scenario.id,
      "--mode",
      "snapshot",
      "--output",
      outputPath,
    ];

    try {
      await import(`${scriptUrl}?scenario=${scenario.id}&ts=${Date.now()}`);
    } finally {
      process.argv = previousArgv;
    }

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
