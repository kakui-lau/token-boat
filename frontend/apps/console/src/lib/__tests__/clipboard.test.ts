import { afterEach, describe, expect, test, vi } from "vitest";

import { copyText } from "../clipboard";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: originalExecCommand,
  });
  document.querySelectorAll('textarea[aria-hidden="true"]').forEach((element) => element.remove());
  vi.restoreAllMocks();
});

describe("copyText", () => {
  test("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyText("request-123");

    expect(writeText).toHaveBeenCalledWith("request-123");
  });

  test("falls back to a temporary textarea when the Clipboard API is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyText("model-id");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector('textarea[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  test("rejects when both clipboard methods are unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: undefined,
    });

    await expect(copyText("event-123")).rejects.toThrow("Clipboard access is unavailable");
  });

  test("rejects empty values without invoking the browser", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(copyText("")).rejects.toThrow("Cannot copy an empty value");
    expect(writeText).not.toHaveBeenCalled();
  });
});
