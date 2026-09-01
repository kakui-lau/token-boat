import { afterEach, describe, expect, test, vi } from "vitest";

import { createPlaygroundConversationSync } from "../playground-conversation-sync";

const broadcastChannelDescriptor = Object.getOwnPropertyDescriptor(window, "BroadcastChannel");

afterEach(() => {
  if (broadcastChannelDescriptor) {
    Object.defineProperty(window, "BroadcastChannel", broadcastChannelDescriptor);
  } else {
    Reflect.deleteProperty(window, "BroadcastChannel");
  }
});

describe("Playground conversation synchronization", () => {
  test("broadcasts only an invalidation marker and closes its channel", () => {
    const channel = new FakeBroadcastChannel();
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: vi.fn(function BroadcastChannelMock() {
        return channel;
      }),
    });
    const listener = vi.fn();
    const sync = createPlaygroundConversationSync(listener);

    sync.publish();

    expect(channel.messages).toEqual([{ id: expect.any(String), threadId: null }]);
    expect(JSON.stringify(channel.messages)).not.toMatch(/message|prompt|token|key/i);

    channel.emit({ id: "remote-change", threadId: "thread-1" });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("thread-1");

    sync.close();
    expect(channel.closed).toBe(true);
  });

  test("uses storage events when BroadcastChannel is unavailable", () => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    });
    const listener = vi.fn();
    const sync = createPlaygroundConversationSync(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "token-boat:playground-conversations-event:v1",
        newValue: JSON.stringify({ id: "remote-change", threadId: null }),
      }),
    );
    expect(listener).toHaveBeenCalledOnce();

    sync.close();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "token-boat:playground-conversations-event:v1",
        newValue: JSON.stringify({ id: "after-close", threadId: null }),
      }),
    );
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
