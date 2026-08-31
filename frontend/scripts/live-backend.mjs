import { fileURLToPath } from "node:url";

const action = Bun.argv[2] ?? "status";
const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const composeFile = fileURLToPath(new URL("../docker-compose.live.yml", import.meta.url));
const sourceDatabaseContainer = "my-postgres";
const sourceApiContainer = "new-api-dev";
const snapshotDatabaseName = "token_boat_frontend_v2";

function resolveDatabaseConnection() {
  const result = Bun.spawnSync([
    "docker",
    "inspect",
    sourceApiContainer,
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Cannot inspect ${sourceApiContainer}; start the local backend first.`);
  }
  const output = new TextDecoder().decode(result.stdout);
  const sourceDsn = output
    .split("\n")
    .find((line) => line.startsWith("SQL_DSN="))
    ?.slice("SQL_DSN=".length);
  if (!sourceDsn) throw new Error(`${sourceApiContainer} does not expose SQL_DSN.`);

  const source = new URL(sourceDsn);
  if (source.protocol !== "postgres:" && source.protocol !== "postgresql:") {
    throw new Error("The local backend is not using PostgreSQL.");
  }
  const snapshot = new URL(source);
  snapshot.pathname = `/${snapshotDatabaseName}`;
  return { password: source.password, snapshotDsn: snapshot.toString() };
}

const database = resolveDatabaseConnection();
const composeEnvironment = {
  ...process.env,
  FRONTEND_V2_SQL_DSN: database.snapshotDsn,
};
const compose = [
  "docker",
  "compose",
  "--project-name",
  "token-boat-frontend-v2-live",
  "--file",
  composeFile,
];

function run(args) {
  const result = Bun.spawnSync([...compose, ...args], {
    cwd: repositoryRoot,
    env: composeEnvironment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function runDatabaseCommand(args, options = {}) {
  const result = Bun.spawnSync(
    [
      "docker",
      "exec",
      ...(options.input ? ["-i"] : []),
      "-e",
      `PGPASSWORD=${database.password}`,
      sourceDatabaseContainer,
      ...args,
    ],
    {
      cwd: repositoryRoot,
      stdin: options.input ?? "inherit",
      stdout: options.capture ? "pipe" : "inherit",
      stderr: "inherit",
    },
  );
  if (result.exitCode !== 0) process.exit(result.exitCode);
  return options.capture ? new TextDecoder().decode(result.stdout).trim() : "";
}

function createSnapshot() {
  const exists = runDatabaseCommand(
    [
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-Atqc",
      `SELECT 1 FROM pg_database WHERE datname = '${snapshotDatabaseName}'`,
    ],
    { capture: true },
  );
  if (exists === "1") {
    console.log(`PostgreSQL snapshot ${snapshotDatabaseName} already exists; no data changed.`);
    return;
  }

  runDatabaseCommand(["createdb", "-h", "127.0.0.1", "-U", "postgres", snapshotDatabaseName]);
  runDatabaseCommand([
    "sh",
    "-c",
    `pg_dump -h 127.0.0.1 -U postgres --no-owner --no-privileges token-boat | psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 ${snapshotDatabaseName}`,
  ]);
  console.log(`Created isolated PostgreSQL snapshot ${snapshotDatabaseName}.`);
}

async function waitForApi() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3001/api/setup");
      if (response.ok) return response.json();
    } catch {
      // The image may still be building or the API may still be migrating.
    }
    await Bun.sleep(500);
  }
  throw new Error("The isolated API did not become ready within 120 seconds.");
}

switch (action) {
  case "snapshot":
    createSnapshot();
    break;
  case "up": {
    run(["up", "--detach", "--build", "--wait", "--remove-orphans"]);
    const setupEnvelope = await waitForApi();
    if (setupEnvelope?.data?.status !== true) {
      throw new Error(`PostgreSQL snapshot ${snapshotDatabaseName} is not initialized.`);
    }
    console.log("\nIsolated Live API: http://127.0.0.1:3001");
    console.log(`Data source: isolated snapshot ${snapshotDatabaseName}`);
    console.log("Sign in with an account from the existing local PostgreSQL database.");
    console.log(`Isolated API tooling remains available for targeted tests in ${frontendRoot}.`);
    break;
  }
  case "down":
    run(["down"]);
    break;
  case "status":
    run(["ps"]);
    break;
  default:
    console.error(`Unknown action: ${action}. Use snapshot, up, down, or status.`);
    process.exit(2);
}
