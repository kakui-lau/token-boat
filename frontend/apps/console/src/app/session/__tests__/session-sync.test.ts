import { afterEach, describe, expect, test, vi } from "vitest";

import { createSessionSync } from "../session-sync";

const broadcastChannelDescriptor = Object.getOwnPropertyDescriptor(window, "BroadcastChannel");

afterEach(() => {
  if (broadcastChannelDescriptor) {
    Object.defineProperty(window, "BroadcastChannel", broadcastChannelDescriptor);
  } else {
    Reflect.deleteProperty(window, "BroadcastChannel");
  }
});

describe("cross-tab session synchronization", () => {
  test("broadcasts only an event marker and accepts valid messages", () => {
    const channel = new FakeBroadcastChannel();
    const BroadcastChannelMock = vi.fn(function BroadcastChannelMock() {
      return channel;
    });
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: BroadcastChannelMock,
    });
    const listener = vi.fn();
    const sync = createSessionSync(listener);

    sync.publish("authenticated");

    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0]).toEqual({ event: "authenticated", id: expect.any(String) });
    expect(JSON.stringify(channel.messages[0])).not.toContain("token");

    channel.emit({ event: "signed-out", id: "remote-event" });
    channel.emit({ event: "signed-out", accessToken: "must-not-be-accepted" });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("signed-out");

    sync.close();
    expect(channel.closed).toBe(true);
  });

  test("uses storage events when BroadcastChannel is unavailable and removes its listener", () => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });
    const listener = vi.fn();
    const sync = createSessionSync(listener);
    const event = new StorageEvent("storage", {
      key: "token-boat:console:session-event:v1",
      newValue: JSON.stringify({ event: "authenticated", id: "storage-event" }),
    });

    window.dispatchEvent(event);
    expect(listener).toHaveBeenCalledWith("authenticated");

    sync.close();
    window.dispatchEvent(event);
    expect(listener).toHaveBeenCalledOnce();
  });
});

class FakeBroadcastChannel {
  closed = false;
  listeners = new Set<(event: MessageEvent<unknown>) => void>();
  messages: unknown[] = [];

  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.add(listener);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    for (const listener of this.listeners) listener(new MessageEvent("message", { data }));
  }

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.delete(listener);
  }
}
