import { useRef } from "react";

type ActionLock = {
  release(): void;
  tryAcquire(): boolean;
};

type KeyedActionLock<Key> = {
  release(key: Key): void;
  tryAcquire(key: Key): boolean;
};

export function useActionLock(): ActionLock {
  const activeRef = useRef(false);

  return {
    release() {
      activeRef.current = false;
    },
    tryAcquire() {
      if (activeRef.current) return false;
      activeRef.current = true;
      return true;
    },
  };
}

export function useKeyedActionLock<Key>(): KeyedActionLock<Key> {
  const activeKeysRef = useRef(new Set<Key>());

  return {
    release(key) {
      activeKeysRef.current.delete(key);
    },
    tryAcquire(key) {
      if (activeKeysRef.current.has(key)) return false;
      activeKeysRef.current.add(key);
      return true;
    },
  };
}
