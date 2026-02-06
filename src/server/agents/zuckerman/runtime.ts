/**
 * Agent runtime entry point
 * Re-exports the Awareness runtime as ZuckermanRuntime for agent discovery
 */
import { Awareness } from "./core/awareness/runtime.js";
export { Awareness as ZuckermanRuntime, Awareness };
export type { LoadedPrompts } from "./core/identity/identity-loader.js";

// Default export for easier discovery
export default Awareness;
