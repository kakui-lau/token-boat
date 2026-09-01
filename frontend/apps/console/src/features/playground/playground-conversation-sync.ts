type PlaygroundConversationSync = {
  close(): void;
  publish(threadId?: string): void;
};

const channelName = "token-boat-playground-conversations-v1";
const storageKey = "token-boat:playground-conversations-event:v1";
let messageSequence = 0;

export function createPlaygroundConversationSync(
  onChange: (threadId: string | null) => void,
): PlaygroundConversationSync {
  if (typeof window === "undefined") return { close() {}, publish() {} };

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof window.BroadcastChannel === "function") {
      channel = new window.BroadcastChannel(channelName);
    }
  } catch {
    channel = null;
  }

  const receive = (value: unknown) => {
    if (!isPlaygroundConversationSyncMessage(value)) return;
    onChange(value.threadId);
  };
  const receiveBroadcast = (event: MessageEvent<unknown>) => receive(event.data);
  const receiveStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed events from older or unrelated clients.
    }
  };
  if (channel) {
    channel.addEventListener("message", receiveBroadcast);
  } else {
    window.addEventListener("storage", receiveStorage);
  }

  return {
    close() {
      if (channel) {
        channel.removeEventListener("message", receiveBroadcast);
        channel.close();
      } else {
        window.removeEventListener("storage", receiveStorage);
      }
    },
    publish(threadId) {
      const message = {
        id: `${Date.now()}-${messageSequence++}`,
        threadId: threadId ?? null,
      };
      if (channel) {
        channel.postMessage(message);
        return;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(message));
        window.localStorage.removeItem(storageKey);
      } catch {
        // The current window still works when cross-window storage is unavailable.
      }
    },
  };
}

function isPlaygroundConversationSyncMessage(
  value: unknown,
): value is { id: string; threadId: string | null } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    (message.threadId === null || typeof message.threadId === "string")
  );
}
