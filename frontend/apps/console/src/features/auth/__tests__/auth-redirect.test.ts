import { beforeEach, describe, expect, test } from "vitest";

import {
  normalizeConsoleRedirect,
  protectedConsoleRedirect,
  rememberOAuthRedirect,
  takeOAuthRedirect,
} from "../lib/auth-redirect";

beforeEach(() => window.sessionStorage.clear());

describe("User Console authentication redirects", () => {
  test("preserves a complete internal console deep link", () => {
    expect(normalizeConsoleRedirect(" /console/logs?detail=request-1#diagnostics ")).toBe(
      "/console/logs?detail=request-1#diagnostics",
    );
  });

  test.each([
    "https://evil.example/console/logs",
    "//evil.example/console/logs",
    "/console\\@evil.example/logs",
    "/dashboard",
    "/console/sign-in?redirect=/console/logs",
  ])("rejects an unsafe or recursive redirect: %s", (target) => {
    expect(normalizeConsoleRedirect(target)).toBeUndefined();
  });

  test("does not add a return target for the console overview", () => {
    expect(protectedConsoleRedirect("/console/")).toBeUndefined();
  });

  test("stores an OAuth return target for one callback only", () => {
    rememberOAuthRedirect("flow-token", "/console/usage?range=30d");

    expect(takeOAuthRedirect("flow-token")).toBe("/console/usage?range=30d");
    expect(takeOAuthRedirect("flow-token")).toBeUndefined();
  });
});
