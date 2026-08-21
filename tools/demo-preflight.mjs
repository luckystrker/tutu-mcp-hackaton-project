const baseUrl = new URL(process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000");
const requireReleaseMetadata =
  process.env.DEMO_REQUIRE_RELEASE_METADATA === "true";
const startedAt = new Date();
const checks = [];

await checkJson("liveness", "/health/live", (body) => body.status === "ok");
await checkJson(
  "readiness",
  "/health/ready",
  (body) => body.status === "ok" && body.dependencies?.database === "ok",
);
await checkJson("build metadata", "/health/build", (body) => {
  const identified =
    typeof body.commitSha === "string" && body.commitSha.length > 0;
  const releaseIdentified =
    body.commitSha !== "development" && typeof body.builtAt === "string";
  return identified && (!requireReleaseMetadata || releaseIdentified);
});

if (
  baseUrl.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(baseUrl.hostname)
) {
  checks.push({
    name: "public HTTPS",
    ok: false,
    detail: "Non-local demo endpoints must use HTTPS",
  });
}

const report = {
  checkedAt: startedAt.toISOString(),
  baseUrl: baseUrl.origin,
  requireReleaseMetadata,
  checks,
  ok: checks.every(({ ok }) => ok),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;

async function checkJson(name, path, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.json();
    checks.push({
      name,
      ok: response.ok && validate(body),
      status: response.status,
      ...(name === "build metadata"
        ? {
            commitSha: body.commitSha,
            builtAt: body.builtAt,
            environment: body.environment,
          }
        : {}),
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "Request failed",
    });
  } finally {
    clearTimeout(timeout);
  }
}
