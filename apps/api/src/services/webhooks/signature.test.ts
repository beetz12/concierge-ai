import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  reconstructPublicUrl,
  safeEqual,
  verifyTwilioSignature,
  verifyVapiHmac,
  verifyVapiSignature,
} from "./signature.js";

test("safeEqual matches equal strings and rejects different ones", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

test("verifyVapiSignature fails open when no secret configured", () => {
  const result = verifyVapiSignature(undefined, undefined, false);
  assert.deepEqual(result, { ok: true, enforced: false });
});

test("verifyVapiSignature fails closed in production when no secret configured", () => {
  const result = verifyVapiSignature("anything", undefined, true);
  assert.equal(result.ok, false);
});

test("verifyVapiHmac fails closed in production when no secret configured", () => {
  const result = verifyVapiHmac("body", "sig", undefined, true);
  assert.equal(result.ok, false);
});

test("verifyTwilioSignature fails closed in production when no auth token", () => {
  const result = verifyTwilioSignature(
    { signature: "sig", url: "https://x/y", params: {}, authToken: undefined },
    true,
  );
  assert.equal(result.ok, false);
});

test("verifyVapiSignature accepts matching secret", () => {
  const result = verifyVapiSignature("s3cr3t", "s3cr3t");
  assert.deepEqual(result, { ok: true, enforced: true });
});

test("verifyVapiSignature rejects missing header when enforced", () => {
  const result = verifyVapiSignature(undefined, "s3cr3t");
  assert.equal(result.ok, false);
});

test("verifyVapiSignature rejects wrong secret", () => {
  const result = verifyVapiSignature("nope", "s3cr3t");
  assert.equal(result.ok, false);
});

test("verifyVapiHmac verifies a correct body signature", () => {
  const body = JSON.stringify({ message: { type: "end-of-call-report" } });
  const secret = "signing-secret";
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  assert.deepEqual(verifyVapiHmac(body, sig, secret), {
    ok: true,
    enforced: true,
  });
});

test("verifyVapiHmac rejects a tampered body", () => {
  const secret = "signing-secret";
  const sig = createHmac("sha256", secret)
    .update("original", "utf8")
    .digest("hex");
  assert.equal(verifyVapiHmac("tampered", sig, secret).ok, false);
});

test("verifyVapiHmac fails open with no secret", () => {
  assert.deepEqual(verifyVapiHmac("x", undefined, undefined, false), {
    ok: true,
    enforced: false,
  });
});

test("verifyTwilioSignature fails open when no auth token", () => {
  const result = verifyTwilioSignature(
    {
      signature: undefined,
      url: "https://x/y",
      params: {},
      authToken: undefined,
    },
    false,
  );
  assert.deepEqual(result, { ok: true, enforced: false });
});

test("verifyTwilioSignature enforces a valid signature end-to-end", () => {
  // Build a signature the Twilio SDK will accept: HMAC-SHA1 over url + sorted
  // key+value pairs, base64.
  const authToken = "test-auth-token";
  const url = "https://api.example.com/api/v1/twilio/webhook";
  const params = { From: "+15551234567", Body: "1", MessageSid: "SM123" };
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params as Record<string, string>)[key], url);
  const signature = createHmac("sha1", authToken)
    .update(Buffer.from(sorted, "utf-8"))
    .digest("base64");

  const good = verifyTwilioSignature({ signature, url, params, authToken });
  assert.deepEqual(good, { ok: true, enforced: true });

  const bad = verifyTwilioSignature({
    signature: "bogus",
    url,
    params,
    authToken,
  });
  assert.equal(bad.ok, false);
});

test("reconstructPublicUrl honors PUBLIC_BASE_URL override", () => {
  const url = reconstructPublicUrl({}, "/api/v1/twilio/webhook", "https://api.example.com/");
  assert.equal(url, "https://api.example.com/api/v1/twilio/webhook");
});

test("reconstructPublicUrl derives from forwarded headers", () => {
  const url = reconstructPublicUrl(
    { "x-forwarded-proto": "https", "x-forwarded-host": "api.example.com" },
    "/api/v1/twilio/webhook",
    undefined,
  );
  assert.equal(url, "https://api.example.com/api/v1/twilio/webhook");
});

test("reconstructPublicUrl falls back to host header", () => {
  const url = reconstructPublicUrl(
    { host: "localhost:8000" },
    "/webhook",
    undefined,
  );
  assert.equal(url, "https://localhost:8000/webhook");
});
