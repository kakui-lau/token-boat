import { demoRepository } from "../demo-repository";
import { describe, expect, test } from "vitest";

describe("demoRepository", () => {
  test("supports the API key lifecycle", async () => {
    const expiresAt = 1_800_000_000;
    const created = await demoRepository.createApiKey({
      name: "Vitest integration",
      expiresAt,
      unlimitedQuota: false,
      quota: 500,
      group: "default",
      environment: "development",
      allowedModels: ["gpt-5"],
      allowedIps: ["127.0.0.1"],
    });

    expect(created.secret).toContain("sk-demo-");
    expect(created.record.expiresAt).toBe(expiresAt);
    expect((await demoRepository.listApiKeys()).some((item) => item.id === created.record.id)).toBe(
      true,
    );

    const disabled = await demoRepository.setApiKeyEnabled(created.record.id, false);
    expect(disabled.status).toBe("disabled");

    await demoRepository.revokeApiKey(created.record.id);
    expect((await demoRepository.listApiKeys()).some((item) => item.id === created.record.id)).toBe(
      false,
    );
  });

  test("redeems the documented demo code", async () => {
    const before = await demoRepository.getBilling();
    const after = await demoRepository.redeemCode("token-boat-demo");
    expect(after.balance).toBe(before.balance + 25);
  });

  test("filters the demo balance ledger independently from payment orders", async () => {
    const result = await demoRepository.getBillingLedgerPage({
      order: "desc",
      page: 1,
      pageSize: 20,
      range: { preset: "custom", from: "2026-01-01", to: "2026-12-31" },
      type: "refund",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ type: "refund", amountUsd: 0.12 });
  });

  test("restores a session after demo sign-out", async () => {
    await demoRepository.signOut(null);
    expect(await demoRepository.getSession()).toBeNull();

    const result = await demoRepository.signIn({ username: "console-tester", password: "demo" });
    expect(result).toMatchObject({
      kind: "authenticated",
      session: { user: { username: "console-tester" } },
    });
  });
});
