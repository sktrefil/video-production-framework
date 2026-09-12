import { normalizeImageSha256, type ImageRuntimeReference } from "@vpf/runtime-contracts/image";
import type { ImageProviderReference } from "./image-runtime.js";

export interface BrowserReferenceUploadTarget {
  uploadReference(input: {
    index: number;
    absolutePath: string;
    mediaId: string;
    role: string;
    sha256: string;
    mimeType: string;
  }): Promise<void>;
}

export interface BrowserReferenceUploadReceipt {
  uploaded: number;
  mediaIds: string[];
  hashes: string[];
}

/**
 * Upload the exact, already verified provider reference set into a browser UI.
 * This layer is transport-only: it must not choose, replace, crop or reinterpret
 * reference images. Selection belongs to WF-09/reference-library and byte/hash
 * verification belongs to ImageRuntimeExecutor.
 */
export async function uploadImageReferencesToBrowser(
  target: BrowserReferenceUploadTarget,
  references: readonly ImageProviderReference[]
): Promise<BrowserReferenceUploadReceipt> {
  const mediaIds: string[] = [];
  const hashes: string[] = [];
  for (const [index, reference] of references.entries()) {
    const sha256 = normalizeImageSha256(reference.sha256);
    await target.uploadReference({
      index,
      absolutePath: reference.absolutePath,
      mediaId: reference.mediaId,
      role: reference.role,
      sha256,
      mimeType: reference.mimeType
    });
    mediaIds.push(reference.mediaId);
    hashes.push(sha256);
  }
  return { uploaded: references.length, mediaIds, hashes };
}

export function assertBrowserUploadMatchesApprovedReferences(
  approved: readonly ImageRuntimeReference[],
  uploaded: BrowserReferenceUploadReceipt
): void {
  if (approved.length !== uploaded.uploaded || approved.length !== uploaded.mediaIds.length || approved.length !== uploaded.hashes.length) {
    throw new Error("Browser reference upload count differs from approved runtime references.");
  }
  for (const [index, reference] of approved.entries()) {
    if (
      uploaded.mediaIds[index] !== reference.mediaId ||
      uploaded.hashes[index] !== normalizeImageSha256(reference.sha256)
    ) {
      throw new Error(`Browser reference upload changed approved reference at index ${index}.`);
    }
  }
}
