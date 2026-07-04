import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localTimeIn,
  resolveCalleeLocalTimes,
  resolveTargetLocale,
  US_CANDIDATE_ZONES,
} from "./timezone.js";

test("area code resolution: maps well-known area codes to their state and zone", () => {
  for (const [number, state, zone] of [
    ["+12125550100", "NY", "America/New_York"],
    ["+13105550100", "CA", "America/Los_Angeles"],
    ["+13125550100", "IL", "America/Chicago"],
    ["+13035550100", "CO", "America/Denver"],
    ["+16025550100", "AZ", "America/Phoenix"],
    ["+19075550100", "AK", "America/Anchorage"],
    ["+18085550100", "HI", "Pacific/Honolulu"],
    ["+13055550100", "FL", "America/New_York"],
    ["+12065550100", "WA", "America/Los_Angeles"],
    ["+18645550100", "SC", "America/New_York"],
  ] as const) {
    assert.deepEqual(resolveTargetLocale(number), { state, zone }, number);
  }
});

test("area code resolution: split-zone states carry per-area-code overrides", () => {
  // El Paso is Mountain while the rest of Texas is Central.
  assert.deepEqual(resolveTargetLocale("+19155550100"), {
    state: "TX",
    zone: "America/Denver",
  });
  assert.deepEqual(resolveTargetLocale("+12145550100"), {
    state: "TX",
    zone: "America/Chicago",
  });
  // Knoxville is Eastern while Nashville is Central.
  assert.deepEqual(resolveTargetLocale("+18655550100"), {
    state: "TN",
    zone: "America/New_York",
  });
  assert.deepEqual(resolveTargetLocale("+16155550100"), {
    state: "TN",
    zone: "America/Chicago",
  });
  // The Florida panhandle is Central.
  assert.deepEqual(resolveTargetLocale("+18505550100"), {
    state: "FL",
    zone: "America/Chicago",
  });
});

test("area code resolution: unknown area codes and non-US numbers resolve to null", () => {
  assert.deepEqual(resolveTargetLocale("+19995550100"), { state: null, zone: null });
  assert.deepEqual(resolveTargetLocale("+442071234567"), { state: null, zone: null });
  assert.deepEqual(resolveTargetLocale("not a number"), { state: null, zone: null });
});

test("callee-local time: computes wall-clock time in the callee's zone (DST-aware)", () => {
  const july = new Date("2026-07-03T16:30:00.000Z");
  assert.deepEqual(localTimeIn("America/New_York", july), {
    zone: "America/New_York",
    hour: 12,
    minute: 30,
  });
  // Standard time: same UTC hour is 11:30 a.m. Eastern in January.
  const january = new Date("2026-01-03T16:30:00.000Z");
  assert.deepEqual(localTimeIn("America/New_York", january), {
    zone: "America/New_York",
    hour: 11,
    minute: 30,
  });
  // Arizona does not observe DST.
  assert.deepEqual(localTimeIn("America/Phoenix", july), {
    zone: "America/Phoenix",
    hour: 9,
    minute: 30,
  });
});

test("callee-local time: known number yields exactly one local time", () => {
  const times = resolveCalleeLocalTimes(
    "+12125550100",
    new Date("2026-07-03T16:30:00.000Z"),
  );
  assert.equal(times.length, 1);
  assert.equal(times[0]!.zone, "America/New_York");
});

test("callee-local time: unknown number yields every candidate US zone (fail closed, R-6)", () => {
  const times = resolveCalleeLocalTimes(
    "+19995550100",
    new Date("2026-07-03T16:30:00.000Z"),
  );
  assert.equal(times.length, US_CANDIDATE_ZONES.length);
  assert.deepEqual(
    times.map((time) => time.zone),
    [...US_CANDIDATE_ZONES],
  );
});
