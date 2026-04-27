import assert from "node:assert/strict";

const base = process.env.SERVER_URL ?? "http://localhost:8080";

const run = async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.ok, true, "Health endpoint should respond");

  const config = await fetch(`${base}/api/config`);
  const payload = await config.json();
  assert.equal(typeof payload.joinUrl, "string");
  assert.equal(typeof payload.qrCodeDataUrl, "string");
  console.log("Smoke test successful.");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
