import { z } from "zod";

export const accountTabSchema = z.enum(["profile", "preferences", "security", "sessions", "theme"]);

export const accountSearchSchema = z.object({
  tab: accountTabSchema.catch("profile").default("profile"),
});

export type AccountTab = z.infer<typeof accountTabSchema>;
