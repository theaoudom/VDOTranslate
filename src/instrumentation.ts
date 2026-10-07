// Runs once when the server starts (Next.js instrumentation hook).
// Node-only work lives in instrumentation-node.ts so the edge build never sees `fs`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
