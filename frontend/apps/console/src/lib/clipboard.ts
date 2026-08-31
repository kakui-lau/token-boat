export async function copyText(value: string): Promise<void> {
  if (!value) throw new Error("Cannot copy an empty value");

  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose the Clipboard API but reject it outside a secure
      // context. Fall through to the synchronous, user-gesture fallback.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw new Error("Clipboard access is unavailable");
  }

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.append(textarea);

  try {
    textarea.focus();
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard command was rejected");
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}
