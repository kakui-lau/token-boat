export type SessionSyncEvent = "authenticated" | "signed-out";

type SessionSyncMessage = {
  event: SessionSyncEvent;
  id: string;
};

type SessionSync = {
  close(): void;
  publish(event: SessionSyncEvent): void;
};

const channelName = "token-boat-console-session-v1";
const storageKey = "token-boat:console:session-event:v1";
let messageSequence = 0;

export function createSessionSync(onEvent: (event: SessionSyncEvent) => void): SessionSync {
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
    if (!isSessionSyncMessage(value)) return;
    onEvent(value.event);
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
    publish(event) {
      const message: SessionSyncMessage = {
        event,
        id: `${Date.now()}-${messageSequence++}`,
      };
      if (channel) {
        channel.postMessage(message);
        return;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(message));
        window.localStorage.removeItem(storageKey);
      } catch {
        // Authentication remains usable when cross-tab storage is unavailable.
      }
    },
  };
}

function isSessionSyncMessage(value: unknown): value is SessionSyncMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    (message.event === "authenticated" || message.event === "signed-out") &&
    typeof message.id === "string" &&
    message.id.length > 0
  );
}
