// Studio keeps experiment admission. The local GUI explicitly selects its
// user-requested review policy; this does not reopen automated experiments.
import { Mastra } from "@mastra/core/mastra";
import { createDispositionConfiguration, interactiveProfile } from "../disposition/runtime.ts";
import { localServerPolicy, localServerRequestGuard } from "./local-server-policy.ts";
export const mastra = new Mastra({
  ...createDispositionConfiguration(undefined, undefined, { profile: interactiveProfile() }),
  server: localServerPolicy,
});
// Instance middleware runs before the native adapter's CORS preflight handler.
// Mastra keeps framework-public sign-in/metadata routes outside this guard.
mastra.setServerMiddleware(localServerRequestGuard);
