/** MIG-09 supplies the unified API endpoint before Studio mounts. */
export const getEditorApiBase = (): string => {
  const config = globalThis as typeof globalThis & {__VPF_EDITOR_API_BASE__?: string};
  const base = config.__VPF_EDITOR_API_BASE__;
  if (!base) {
    throw new Error("Unified editor API is not configured. Save, media import and production actions require MIG-09 runtime integration.");
  }
  return base.replace(/\/$/, "");
};
