// Verification engine (owner: D). Pure functions only, no I/O, no LLM.
// Exports must match the engine → server boundary in CONTRACT.md.
export { verifyMarginCall } from "./margin.ts";
export { verifyLoanDraw } from "./loan.ts";
export { evidenceHash } from "./evidence.ts";

/** Recorded in every evidence bundle. Bump when any result could change. */
export const ENGINE_VERSION = "engine-0.1.0";
