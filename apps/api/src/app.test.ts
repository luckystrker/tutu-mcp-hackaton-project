import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("health routes", () => {
  it("reports liveness without checking external dependencies", async () => {
    const readinessCheck = vi.fn();
    const app = buildApp({ readinessCheck });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(readinessCheck).not.toHaveBeenCalled();
  });

  it("reports database readiness", async () => {
    const app = buildApp({
      readinessCheck: vi.fn().mockResolvedValue(undefined),
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { "x-request-id": "health-1" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      dependencies: { database: "ok" },
    });
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    const app = buildApp({
      readinessCheck: vi
        .fn()
        .mockRejectedValue(new Error("private connection detail")),
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private connection detail");
  });

  it("returns the shared safe error envelope with request id", async () => {
    const app = buildApp({ readinessCheck: vi.fn() });
    app.get("/boom", async () => {
      throw new Error("private failure detail");
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "request-42" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId: "request-42",
      },
    });
    expect(response.body).not.toContain("private failure detail");
  });

  it("preserves client error status codes and localizes safe messages", async () => {
    const app = buildApp({ readinessCheck: vi.fn() });
    app.get("/nope", async () => {
      throw Object.assign(new Error("Expected a UUID"), {
        statusCode: 400,
      });
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "BAD_REQUEST", message: "The request is invalid" },
    });
    expect(response.body).not.toContain("Expected a UUID");

    const russianResponse = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { "accept-language": "ru-RU,ru;q=0.9" },
    });
    expect(russianResponse.json()).toMatchObject({
      error: { code: "BAD_REQUEST", message: "Некорректный запрос" },
    });
  });

  it("maps malformed JSON bodies to 400", async () => {
    const app = buildApp({ readinessCheck: vi.fn() });
    app.post("/echo", async (request) => request.body);
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: '{"oops',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  it("returns the shared error envelope for unknown routes", async () => {
    const app = buildApp({ readinessCheck: vi.fn() });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/definitely-not-a-route",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested item was not found",
        requestId: expect.any(String),
      },
    });
  });
});
