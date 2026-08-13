import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "~/proxy.ts";

vi.mock("~/server/server-only-functions/server-only-functions.ts", () => ({ logMessage: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("single tenancy routing", () => {
  it.each([
    ["/", "/default"],
    ["/about", "/default/about"],
    ["/competitions", "/default/competitions"],
    ["/records", "/default/records"],
    ["/rankings", "/default/rankings"],
  ])("redirects %s through the public app origin", (source, destination) => {
    vi.stubEnv("NEXT_PUBLIC_MULTITENANCY_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://contests.example.com");

    const response = proxy(new NextRequest(`https://localhost:3005${source}?view=all`));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(`https://contests.example.com${destination}?view=all`);
    expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("preserves the method while adding the default API slug", () => {
    vi.stubEnv("NEXT_PUBLIC_MULTITENANCY_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://contests.example.com");

    const response = proxy(
      new NextRequest("https://localhost:3005/api/results?event=333", { method: "POST" }),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://contests.example.com/api/default/results?event=333",
    );
  });

  it("does not redirect routes that already include an organization slug", () => {
    vi.stubEnv("NEXT_PUBLIC_MULTITENANCY_ENABLED", "false");

    expect(proxy(new NextRequest("https://localhost:3005/default/about"))).toBeUndefined();
  });
});
