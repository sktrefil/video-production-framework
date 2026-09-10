// Thin execution entrypoint; no image planning or style authority lives here.
export { ImageRuntimeExecutor, MockImageProvider, probeImage } from "@vpf/provider-orchestrator/image-runtime";

/** Adapt MIG-03's verified resolver without introducing a second style/format registry. */
export function imageFormatResolver(registry) {
  return { resolve: pin => registry.resolvePinned({ ...pin, resourceType: "FORMAT_PROFILE" }) };
}
