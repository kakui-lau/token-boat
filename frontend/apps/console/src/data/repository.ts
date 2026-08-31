import type { ConsoleRepository } from "./contracts";
import { demoRepository } from "./demo-repository";
import { liveRepository } from "./live-repository";

export const repository: ConsoleRepository =
  import.meta.env.VITE_CONSOLE_DATA_MODE === "demo" ? demoRepository : liveRepository;
