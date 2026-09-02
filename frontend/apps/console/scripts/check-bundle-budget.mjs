import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assetsDirectory = fileURLToPath(new URL("../dist/assets", import.meta.url));
const maximumEntryChunkBytes = 400 * 1024;
// CopilotKit is loaded only after a user starts a Playground conversation. Keeping
// its circular dependency graph intact is more important than splitting it into
// package-sized chunks that can execute in the wrong initialization order.
const maximumCopilotChunkBytes = 1_600 * 1024;
const maximumJavaScriptChunkBytes = 1_000 * 1024;
const maximumInitialJavaScriptBytes = 700 * 1024;

const assetNames = await readdir(assetsDirectory);
const copilotChunks = assetNames.filter(
  (name) => name.endsWith(".js") && /^copilot(?:kit|-)/.test(name),
);
const javascriptChunks = assetNames.filter((name) => name.endsWith(".js"));

if (copilotChunks.length === 0) {
  throw new Error("No deferred CopilotKit JavaScript chunks were emitted.");
}

const oversizedChunks = [];
for (const name of copilotChunks) {
  const { size } = await stat(fileURLToPath(new URL(`../dist/assets/${name}`, import.meta.url)));
  if (size > maximumCopilotChunkBytes) oversizedChunks.push(`${name} (${size} bytes)`);
}

if (oversizedChunks.length > 0) {
  throw new Error(
    `CopilotKit bundle budget exceeded (${maximumCopilotChunkBytes} bytes): ${oversizedChunks.join(", ")}`,
  );
}

const oversizedJavaScriptChunks = [];
for (const name of javascriptChunks) {
  if (copilotChunks.includes(name)) continue;
  const { size } = await stat(fileURLToPath(new URL(`../dist/assets/${name}`, import.meta.url)));
  if (size > maximumJavaScriptChunkBytes) {
    oversizedJavaScriptChunks.push(`${name} (${size} bytes)`);
  }
}
if (oversizedJavaScriptChunks.length > 0) {
  throw new Error(
    `JavaScript bundle budget exceeded (${maximumJavaScriptChunkBytes} bytes): ${oversizedJavaScriptChunks.join(", ")}`,
  );
}

const entryHtml = await readFile(
  fileURLToPath(new URL("../dist/index.html", import.meta.url)),
  "utf8",
);
if (/\/console\/assets\/(?:copilot(?:kit|-)|wallet-auth-)/.test(entryHtml)) {
  throw new Error(
    "CopilotKit and wallet authentication assets must remain deferred from the console entry document.",
  );
}
if (
  /\/console\/assets\/(?:repository-|live-auth-repository-|webauthn-|alert-status-popover-|console-shell-|sonner-|schemas-)/.test(
    entryHtml,
  )
) {
  throw new Error(
    "The complete business repository, auth actions, WebAuthn helpers, authenticated shell, alert popover, toast renderer, and form-validation schemas must remain deferred from the console entry document.",
  );
}

const entryScriptMatch = entryHtml.match(/<script[^>]+src="\/console\/assets\/([^"]+\.js)"/);
if (!entryScriptMatch?.[1]) {
  throw new Error("Unable to resolve the Console JavaScript entry chunk.");
}
const entryScriptSize = (
  await stat(fileURLToPath(new URL(`../dist/assets/${entryScriptMatch[1]}`, import.meta.url)))
).size;
if (entryScriptSize > maximumEntryChunkBytes) {
  throw new Error(
    `Console entry bundle budget exceeded (${maximumEntryChunkBytes} bytes): ${entryScriptMatch[1]} (${entryScriptSize} bytes)`,
  );
}

const initialChunkNames = [
  ...new Set([...entryHtml.matchAll(/\/console\/assets\/([^"']+\.js)/g)].map((match) => match[1])),
];
const oversizedInitialChunks = [];
let initialJavaScriptBytes = 0;
for (const name of initialChunkNames) {
  const { size } = await stat(fileURLToPath(new URL(`../dist/assets/${name}`, import.meta.url)));
  initialJavaScriptBytes += size;
  if (size > maximumEntryChunkBytes) oversizedInitialChunks.push(`${name} (${size} bytes)`);
}
if (oversizedInitialChunks.length > 0) {
  throw new Error(
    `Console initial bundle budget exceeded (${maximumEntryChunkBytes} bytes): ${oversizedInitialChunks.join(", ")}`,
  );
}
if (initialJavaScriptBytes > maximumInitialJavaScriptBytes) {
  throw new Error(
    `Console total initial JavaScript budget exceeded (${maximumInitialJavaScriptBytes} bytes): ${initialJavaScriptBytes} bytes across ${initialChunkNames.length} chunks`,
  );
}

console.log(
  `Verified ${initialJavaScriptBytes} bytes across ${initialChunkNames.length} initial Console chunks and ${copilotChunks.length} deferred CopilotKit chunks.`,
);
