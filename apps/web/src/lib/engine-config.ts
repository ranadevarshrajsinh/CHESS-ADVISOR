export const engineConfig = {
  depth: parseInt(
    process.env.NEXT_PUBLIC_ANALYSIS_ENGINE_DEPTH || "14",
    10
  ),
  multiPv: parseInt(
    process.env.NEXT_PUBLIC_ANALYSIS_MULTIPV || "3",
    10
  ),
  maxWorkers: parseInt(
    process.env.NEXT_PUBLIC_ANALYSIS_MAX_WORKERS || "8",
    10
  ),
  hashSize: parseInt(
    process.env.NEXT_PUBLIC_ANALYSIS_HASH_MB || "16",
    10
  ),
  lite:
    process.env.NEXT_PUBLIC_ANALYSIS_USE_LITE !== "false",
  enabled:
    process.env.NEXT_PUBLIC_ANALYSIS_ENABLE_WASM !== "false",
};
