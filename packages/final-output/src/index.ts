import {createHash} from "node:crypto";
import type {
  ApprovalRecord,
  FinalDeliveryManifest,
  FinalOutputQcRecord,
  FinalOutputReadiness,
  FinalRenderAttempt,
  FinalRenderTechnicalQcRecord,
  PublishHandoffOutput,
  PublishMetadata,
  PublishPackageFile,
  PublishPackageManifest
} from "@vpf/domain";
import type {OutboxRecord, WorkflowEvent} from "@vpf/workflow";

export interface FinalOutputRepository {
  getLatestRenderAttempt(projectId: string): Promise<FinalRenderAttempt | null>;
  getLatestTechnicalQc(
    projectId: string,
    renderAttemptId: string
  ): Promise<FinalRenderTechnicalQcRecord | null>;
  getLatestDeliveryManifest(projectId: string): Promise<FinalDeliveryManifest | null>;
  getLatestFinalOutputQc(projectId: string): Promise<FinalOutputQcRecord | null>;
  getLatestPublishPackage(projectId: string): Promise<PublishPackageManifest | null>;
  commitFinalOutputQc(input: {
    previousQc: FinalOutputQcRecord | null;
    nextQc: FinalOutputQcRecord;
    approval?: ApprovalRecord;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitPublishPackage(input: {
    previousPackage: PublishPackageManifest | null;
    nextPackage: PublishPackageManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
  commitPublishPackageStale(input: {
    previousPackage: PublishPackageManifest;
    nextPackage: PublishPackageManifest;
    event: WorkflowEvent;
    outbox: OutboxRecord;
  }): Promise<void>;
}

export interface FinalOutputClock {
  nowIso(): string;
}

export interface FinalOutputIdFactory {
  next(
    prefix:
      | "output-qc"
      | "package"
      | "approval"
      | "evt"
      | "outbox"
  ): string;
}

export class FinalOutputValidationError extends Error {
  constructor(
    public readonly code:
      | "DELIVERY_NOT_READY"
      | "TECHNICAL_QC_NOT_READY"
      | "OUTPUT_QC_INVALID"
      | "OUTPUT_QC_NOT_READY"
      | "OUTPUT_QC_REVIEW_REQUIRED"
      | "PUBLISH_METADATA_INVALID",
    message: string
  ) {
    super(message);
    this.name = "FinalOutputValidationError";
  }
}

export interface FinalOutputQcInput {
  projectId: string;
  status: "PASS" | "FIX_REQUIRED" | "BLOCKED";
  confidence: number;
  issueCodes?: string[];
  notes?: string[];
  reviewRequired?: boolean;
}

export interface PublishPackageOutcome {
  manifest: PublishPackageManifest;
  output: PublishHandoffOutput;
  created: boolean;
}

function durableEvent(
  ids: FinalOutputIdFactory,
  clock: FinalOutputClock,
  input: Omit<WorkflowEvent, "eventId" | "createdAt">
): {event: WorkflowEvent; outbox: OutboxRecord} {
  const createdAt = clock.nowIso();
  const event: WorkflowEvent = {
    ...input,
    eventId: ids.next("evt"),
    createdAt
  };
  return {
    event,
    outbox: {
      outboxId: ids.next("outbox"),
      eventId: event.eventId,
      status: "PENDING",
      attempts: 0,
      createdAt
    }
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isFiniteConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function normalizeMetadata(input: PublishMetadata): PublishMetadata {
  const title = input.title.trim();
  const description = input.description;
  const tags = [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))];
  const language = input.language?.trim();
  const categoryId = input.categoryId?.trim();

  if (!title) {
    throw new FinalOutputValidationError(
      "PUBLISH_METADATA_INVALID",
      "Publish title is required."
    );
  }
  if (!Array.isArray(input.tags)) {
    throw new FinalOutputValidationError(
      "PUBLISH_METADATA_INVALID",
      "Publish tags must be an array."
    );
  }
  if (input.platform !== "YOUTUBE") {
    throw new FinalOutputValidationError(
      "PUBLISH_METADATA_INVALID",
      "WF-18 currently supports YOUTUBE publish handoff."
    );
  }

  return {
    platform: "YOUTUBE",
    title,
    description,
    tags,
    visibility: input.visibility,
    madeForKids: input.madeForKids,
    ...(language ? {language} : {}),
    ...(categoryId ? {categoryId} : {}),
    ...(input.thumbnail
      ? {
          thumbnail: {
            relativePath: input.thumbnail.relativePath,
            ...(input.thumbnail.sizeBytes === undefined
              ? {}
              : {sizeBytes: input.thumbnail.sizeBytes}),
            ...(input.thumbnail.sha256 === undefined
              ? {}
              : {sha256: input.thumbnail.sha256})
          }
        }
      : {})
  };
}

function qcSidecarPath(projectId: string): string {
  return "out/" + projectId + "/final_output_qc.json";
}

function metadataSidecarPath(projectId: string): string {
  return "out/" + projectId + "/publish_metadata.json";
}

function packageDirectory(projectId: string): string {
  return "out/" + projectId + "/publish";
}

function packageFiles(input: {
  projectId: string;
  render: FinalRenderAttempt;
  delivery: FinalDeliveryManifest;
  metadata: PublishMetadata;
}): PublishPackageFile[] {
  const base = packageDirectory(input.projectId);
  const files: PublishPackageFile[] = [
    {
      role: "VIDEO",
      relativePath: base + "/final.mp4",
      sizeBytes: input.delivery.outputSizeBytes,
      sha256: input.delivery.outputSha256
    },
    {
      role: "RENDER_MANIFEST",
      relativePath: base + "/render_manifest.json"
    },
    {
      role: "TECHNICAL_QC",
      relativePath: base + "/technical_qc.json"
    },
    {
      role: "DELIVERY_MANIFEST",
      relativePath: base + "/delivery_manifest.json"
    },
    {
      role: "FINAL_OUTPUT_QC",
      relativePath: base + "/final_output_qc.json"
    },
    {
      role: "PUBLISH_METADATA",
      relativePath: base + "/publish_metadata.json"
    }
  ];

  if (input.metadata.thumbnail) {
    const raw = input.metadata.thumbnail.relativePath.replaceAll("\\", "/");
    const name = raw.split("/").filter(Boolean).at(-1) ?? "thumbnail";
    files.push({
      role: "THUMBNAIL",
      relativePath: base + "/" + name,
      ...(input.metadata.thumbnail.sizeBytes === undefined
        ? {}
        : {sizeBytes: input.metadata.thumbnail.sizeBytes}),
      ...(input.metadata.thumbnail.sha256 === undefined
        ? {}
        : {sha256: input.metadata.thumbnail.sha256})
    });
  }

  return files;
}

export class FinalOutputPipeline {
  constructor(
    private readonly repository: FinalOutputRepository,
    private readonly clock: FinalOutputClock,
    private readonly ids: FinalOutputIdFactory
  ) {}

  async recordFinalOutputQc(input: FinalOutputQcInput): Promise<FinalOutputQcRecord> {
    await this.reconcileStale(input.projectId);
    const {render, delivery, technicalQc} =
      await this.requireCurrentDelivery(input.projectId);

    if (!isFiniteConfidence(input.confidence)) {
      throw new FinalOutputValidationError(
        "OUTPUT_QC_INVALID",
        "Final Output QC confidence must be between 0 and 1."
      );
    }

    const issueCodes = [...new Set(input.issueCodes ?? [])];
    const notes = [...(input.notes ?? [])];
    if (
      (input.status === "FIX_REQUIRED" || input.status === "BLOCKED") &&
      issueCodes.length === 0
    ) {
      throw new FinalOutputValidationError(
        "OUTPUT_QC_INVALID",
        input.status + " requires at least one issue code."
      );
    }

    const reviewRequired = input.reviewRequired === true;
    const status =
      input.status === "PASS" && reviewRequired
        ? "NEEDS_REVIEW"
        : input.status;

    const previous = await this.repository.getLatestFinalOutputQc(input.projectId);
    const now = this.clock.nowIso();
    const next: FinalOutputQcRecord = {
      id: previous?.id ?? this.ids.next("output-qc"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      renderAttemptId: render.id,
      renderAttemptRevision: render.revision,
      deliveryManifestId: delivery.id,
      deliveryManifestRevision: delivery.revision,
      projectSha256: delivery.projectSha256,
      outputPath: delivery.outputPath,
      outputSha256: delivery.outputSha256,
      status,
      confidence: input.confidence,
      issueCodes,
      notes,
      reviewRequired
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_OUTPUT_QC_RECORDED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "QC_RESULT",
      payload: {
        outputQcId: next.id,
        outputQcRevision: next.revision,
        status: next.status,
        renderAttemptId: render.id,
        deliveryManifestId: delivery.id,
        technicalQcId: technicalQc.id,
        outputSha256: delivery.outputSha256,
        issueCodes
      }
    });

    await this.repository.commitFinalOutputQc({
      previousQc: previous,
      nextQc: next,
      event,
      outbox
    });

    return next;
  }

  async approveFinalOutputQc(input: {
    projectId: string;
    approvedById?: string;
    reason?: string;
  }): Promise<FinalOutputQcRecord> {
    await this.reconcileStale(input.projectId);
    const current = await this.repository.getLatestFinalOutputQc(input.projectId);
    if (current === null || current.status !== "NEEDS_REVIEW") {
      throw new FinalOutputValidationError(
        "OUTPUT_QC_REVIEW_REQUIRED",
        "Only NEEDS_REVIEW Final Output QC can be approved."
      );
    }

    const {delivery} = await this.requireCurrentDelivery(input.projectId);
    if (
      current.deliveryManifestId !== delivery.id ||
      current.deliveryManifestRevision !== delivery.revision ||
      current.outputSha256 !== delivery.outputSha256
    ) {
      throw new FinalOutputValidationError(
        "OUTPUT_QC_NOT_READY",
        "Final Output QC targets a stale delivery."
      );
    }

    const now = this.clock.nowIso();
    const approval: ApprovalRecord = {
      id: this.ids.next("approval"),
      projectId: input.projectId,
      targetType: "FINAL_OUTPUT",
      targetId: current.id,
      targetRevision: current.revision,
      approvalState: "APPROVED",
      reason: input.reason ?? "Final Output QC approved after review.",
      approvedByType: "USER",
      ...(input.approvedById ? {approvedById: input.approvedById} : {}),
      selectedMediaId: undefined,
      createdAt: now
    };
    const next: FinalOutputQcRecord = {
      ...current,
      revision: current.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      status: "PASS",
      reviewApprovalId: approval.id
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "FINAL_OUTPUT_QC_APPROVED",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "USER",
      payload: {
        outputQcId: next.id,
        outputQcRevision: next.revision,
        approvalId: approval.id,
        deliveryManifestId: delivery.id,
        outputSha256: delivery.outputSha256
      }
    });

    await this.repository.commitFinalOutputQc({
      previousQc: current,
      nextQc: next,
      approval,
      event,
      outbox
    });

    return next;
  }

  async createPublishPackage(input: {
    projectId: string;
    metadata: PublishMetadata;
  }): Promise<PublishPackageOutcome> {
    await this.reconcileStale(input.projectId);
    const {render, delivery} = await this.requireCurrentDelivery(input.projectId);
    const outputQc = await this.repository.getLatestFinalOutputQc(input.projectId);

    if (
      outputQc === null ||
      outputQc.status !== "PASS" ||
      outputQc.deliveryManifestId !== delivery.id ||
      outputQc.deliveryManifestRevision !== delivery.revision ||
      outputQc.outputSha256 !== delivery.outputSha256
    ) {
      throw new FinalOutputValidationError(
        "OUTPUT_QC_NOT_READY",
        "Publish packaging requires current Final Output QC PASS."
      );
    }

    const metadata = normalizeMetadata(input.metadata);
    const files = packageFiles({
      projectId: input.projectId,
      render,
      delivery,
      metadata
    });
    const pkgSha = sha256({
      projectId: input.projectId,
      projectSha256: delivery.projectSha256,
      renderAttemptId: render.id,
      renderAttemptRevision: render.revision,
      deliveryManifestId: delivery.id,
      deliveryManifestRevision: delivery.revision,
      outputQcId: outputQc.id,
      outputQcRevision: outputQc.revision,
      metadata,
      files
    });

    const previous = await this.repository.getLatestPublishPackage(input.projectId);
    if (
      previous !== null &&
      previous.packageStatus === "READY" &&
      previous.packageSha256 === pkgSha &&
      previous.deliveryManifestId === delivery.id &&
      previous.deliveryManifestRevision === delivery.revision &&
      previous.outputQcId === outputQc.id &&
      previous.outputQcRevision === outputQc.revision
    ) {
      return {
        manifest: previous,
        output: this.toOutput(previous),
        created: false
      };
    }

    const now = this.clock.nowIso();
    const next: PublishPackageManifest = {
      id: previous?.id ?? this.ids.next("package"),
      projectId: input.projectId,
      revision: previous === null ? 1 : previous.revision + 1,
      lifecycleStatus: "ACTIVE",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      renderAttemptId: render.id,
      renderAttemptRevision: render.revision,
      deliveryManifestId: delivery.id,
      deliveryManifestRevision: delivery.revision,
      outputQcId: outputQc.id,
      outputQcRevision: outputQc.revision,
      projectSha256: delivery.projectSha256,
      packageStatus: "READY",
      packageDirectory: packageDirectory(input.projectId),
      packageSha256: pkgSha,
      metadata,
      files,
      recommendedFileName: "publish_handoff.json"
    };

    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId: input.projectId,
      eventType: "PUBLISH_PACKAGE_READY",
      targetType: "PROJECT",
      targetId: input.projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        packageId: next.id,
        packageRevision: next.revision,
        packageSha256: next.packageSha256,
        deliveryManifestId: delivery.id,
        outputQcId: outputQc.id,
        platform: metadata.platform
      }
    });

    await this.repository.commitPublishPackage({
      previousPackage: previous,
      nextPackage: next,
      event,
      outbox
    });

    return {
      manifest: next,
      output: this.toOutput(next),
      created: true
    };
  }

  async reconcileStale(projectId: string): Promise<boolean> {
    const pkg = await this.repository.getLatestPublishPackage(projectId);
    if (pkg === null || pkg.packageStatus === "STALE") return false;

    const delivery = await this.repository.getLatestDeliveryManifest(projectId);
    const qc = await this.repository.getLatestFinalOutputQc(projectId);
    const stale =
      delivery === null ||
      delivery.status !== "READY" ||
      qc === null ||
      qc.status !== "PASS" ||
      pkg.deliveryManifestId !== delivery.id ||
      pkg.deliveryManifestRevision !== delivery.revision ||
      pkg.outputQcId !== qc.id ||
      pkg.outputQcRevision !== qc.revision ||
      pkg.projectSha256 !== delivery.projectSha256;

    if (!stale) return false;

    const now = this.clock.nowIso();
    const next: PublishPackageManifest = {
      ...pkg,
      revision: pkg.revision + 1,
      lifecycleStatus: "ACTIVE",
      updatedAt: now,
      packageStatus: "STALE"
    };
    const {event, outbox} = durableEvent(this.ids, this.clock, {
      projectId,
      eventType: "PUBLISH_PACKAGE_STALE",
      targetType: "PROJECT",
      targetId: projectId,
      trigger: "WORKFLOW_ENGINE",
      payload: {
        packageId: pkg.id,
        previousRevision: pkg.revision,
        reason: "SOURCE_DELIVERY_OR_OUTPUT_QC_CHANGED"
      }
    });
    await this.repository.commitPublishPackageStale({
      previousPackage: pkg,
      nextPackage: next,
      event,
      outbox
    });
    return true;
  }

  async getReadiness(projectId: string): Promise<FinalOutputReadiness> {
    await this.reconcileStale(projectId);

    let delivery: FinalDeliveryManifest | null = null;
    try {
      ({delivery} = await this.requireCurrentDelivery(projectId));
    } catch {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "WAITING_FOR_DELIVERY",
        blockers: ["DELIVERY_NOT_READY"]
      };
    }

    const qc = await this.repository.getLatestFinalOutputQc(projectId);
    if (qc === null) {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "QC_REQUIRED",
        blockers: ["FINAL_OUTPUT_QC_REQUIRED"]
      };
    }

    if (
      qc.deliveryManifestId !== delivery.id ||
      qc.deliveryManifestRevision !== delivery.revision ||
      qc.outputSha256 !== delivery.outputSha256
    ) {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "STALE",
        blockers: ["FINAL_OUTPUT_QC_STALE"]
      };
    }

    if (qc.status === "NEEDS_REVIEW") {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "NEEDS_REVIEW",
        blockers: ["FINAL_OUTPUT_QC_REVIEW_REQUIRED"]
      };
    }
    if (qc.status === "FIX_REQUIRED") {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "FIX_REQUIRED",
        blockers: qc.issueCodes
      };
    }
    if (qc.status === "BLOCKED") {
      return {
        finalOutputQcPassed: false,
        packageReady: false,
        publishHandoffReady: false,
        status: "BLOCKED",
        blockers: qc.issueCodes
      };
    }

    const pkg = await this.repository.getLatestPublishPackage(projectId);
    if (
      pkg !== null &&
      pkg.packageStatus === "READY" &&
      pkg.deliveryManifestId === delivery.id &&
      pkg.deliveryManifestRevision === delivery.revision &&
      pkg.outputQcId === qc.id &&
      pkg.outputQcRevision === qc.revision
    ) {
      return {
        finalOutputQcPassed: true,
        packageReady: true,
        publishHandoffReady: true,
        status: "PACKAGE_READY",
        blockers: []
      };
    }

    return {
      finalOutputQcPassed: true,
      packageReady: false,
      publishHandoffReady: false,
      status: "QC_REQUIRED",
      blockers: ["PUBLISH_PACKAGE_REQUIRED"]
    };
  }

  private toOutput(manifest: PublishPackageManifest): PublishHandoffOutput {
    return {
      schemaVersion: "1.0",
      projectId: manifest.projectId,
      createdAt: manifest.updatedAt,
      status: manifest.packageStatus,
      projectSha256: manifest.projectSha256,
      packageSha256: manifest.packageSha256,
      packageDirectory: manifest.packageDirectory,
      recommendedFileName: "publish_handoff.json",
      metadata: structuredClone(manifest.metadata),
      files: structuredClone(manifest.files)
    };
  }

  private async requireCurrentDelivery(projectId: string): Promise<{
    render: FinalRenderAttempt;
    delivery: FinalDeliveryManifest;
    technicalQc: FinalRenderTechnicalQcRecord;
  }> {
    const render = await this.repository.getLatestRenderAttempt(projectId);
    const delivery = await this.repository.getLatestDeliveryManifest(projectId);
    if (
      render === null ||
      render.status !== "DELIVERY_READY" ||
      delivery === null ||
      delivery.status !== "READY" ||
      delivery.renderAttemptId !== render.id ||
      delivery.renderAttemptRevision !== render.revision
    ) {
      throw new FinalOutputValidationError(
        "DELIVERY_NOT_READY",
        "WF-18 requires the current WF-17 delivery to be READY."
      );
    }

    const technicalQc = await this.repository.getLatestTechnicalQc(
      projectId,
      render.id
    );
    if (
      technicalQc === null ||
      technicalQc.status !== "PASS" ||
      technicalQc.renderAttemptRevision !== render.revision ||
      technicalQc.outputSha256 !== delivery.outputSha256
    ) {
      throw new FinalOutputValidationError(
        "TECHNICAL_QC_NOT_READY",
        "WF-18 requires current Technical QC PASS."
      );
    }

    return {render, delivery, technicalQc};
  }
}

export const finalOutputSidecarPaths = (projectId: string) => ({
  finalOutputQcPath: qcSidecarPath(projectId),
  publishMetadataPath: metadataSidecarPath(projectId),
  packageDirectory: packageDirectory(projectId),
  publishHandoffPath:
    packageDirectory(projectId) + "/publish_handoff.json"
});
