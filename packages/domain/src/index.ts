export type ProjectFormat = "LONGFORM" | "SHORTFORM";

export type ApprovalState =
  | "NOT_REQUIRED" | "PENDING" | "AUTO_APPROVED" | "HUMAN_APPROVED"
  | "REJECTED" | "REVOKED";

export type LifecycleStatus = "ACTIVE" | "SUPERSEDED" | "ARCHIVED";

export interface VersionPins {
  frameworkVersion: string;
  dataModelVersion: string;
  channelVisualBibleVersion: string;
  productionSystemVersion: string;
  ruleRegistryVersion: string;
  formatProfileVersion: string;
  providerProfileVersions: Record<string, string>;
  projectStyleVersion: string;
  editTemplateVersion?: string;
}

export type SceneStateField = "STATE_IN" | "STATE_CURRENT" | "STATE_OUT";

export interface StateRef {
  entityType: "SCENE";
  entityId: string;
  stateField: SceneStateField;
  entityRevision?: number;
}

export interface BaseEntity {
  id: string;
  projectId: string;
  revision: number;
  lifecycleStatus: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export type FactClassification = "FACT" | "PLAUSIBLE" | "INTERPRETATION";
export type FactStatus = "DRAFT" | "APPROVED" | "REJECTED";

export interface ResearchSource extends BaseEntity {
  title: string;
  sourceType: "WEB" | "BOOK" | "PAPER" | "ARCHIVE" | "USER_FILE" | "OTHER";
  url?: string;
  citation?: string;
  notes?: string;
}

export interface FactRecord extends BaseEntity {
  statement: string;
  classification: FactClassification;
  sourceIds: string[];
  status: FactStatus;
}

export interface ScriptVersion extends BaseEntity {
  kind: "DRAFT" | "FINAL";
  body: string;
  supersedesRevision?: number;
}

export type ApprovalTargetType =
  | "SCRIPT"
  | "STORY_STRUCTURE"
  | "SCENE"
  | "PROJECT_STYLE"
  | "IDENTITY_ANCHOR"
  | "ASSET"
  | "LINK"
  | "CLIP";

export interface ApprovalRecord {
  id: string;
  projectId: string;
  targetType: ApprovalTargetType;
  targetId: string;
  targetRevision: number;
  approvalState: ApprovalState;
  reason: string;
  approvedByType: "USER" | "SYSTEM";
  approvedById?: string;
  selectedMediaId?: string;
  createdAt: string;
}

export interface StoryFreshness {
  stale: boolean;
  staleReason?: string;
}

export interface Chapter extends BaseEntity, StoryFreshness {
  displayNumber: number;
  title: string;
  sourceScriptId: string;
  sourceScriptRevision: number;
  sequenceIds: string[];
}

export interface Sequence extends BaseEntity, StoryFreshness {
  chapterId: string;
  displayNumber: number;
  title: string;
  storyPurpose: string;
  sourceScriptId: string;
  sourceScriptRevision: number;
  sceneIds: string[];
}

export type SceneLifecycleState =
  | "DRAFT"
  | "DESIGNED"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "IN_PRODUCTION"
  | "PRODUCTION_COMPLETE"
  | "REWORK_REQUIRED"
  | "SUPERSEDED";

export interface ScriptSegmentRef {
  scriptId: string;
  scriptRevision: number;
  startChar?: number;
  endChar?: number;
}

export interface Scene extends BaseEntity, StoryFreshness {
  sequenceId: string;
  displayNumber: number;
  scriptSegment: string;
  scriptRef: ScriptSegmentRef;
  stateIn: string;
  stateCurrent: string;
  stateOut: string;
  primaryVisualIdea: string;
  mustBeSeen: string[];
  canBeNarrated: string[];
  canBeImplied: string[];
  requiredIdentityAnchorIds: string[];
  primaryAssetId?: string;
  sceneStatus: SceneLifecycleState;
}

export interface ProjectRecord extends BaseEntity {
  title: string;
  format: ProjectFormat;
  versions: VersionPins;
}


export interface VisualFreshness {
  stale: boolean;
  staleReason?: string;
}

export interface ProjectStyle extends BaseEntity, VisualFreshness {
  channelVisualBibleVersion: string;
  sourceScriptId: string;
  sourceScriptRevision: number;
  eraRegion: string;
  visualApproach: string;
  realismLevel: string;
  colorLanguage: string;
  lightingLanguage: string;
  materialLanguage: string;
  environmentLanguage: string;
  characterRenderingPrinciple: string;
  cameraCompositionTendency: string;
  moodRange: string[];
  factualConstraints: string[];
  avoidances: string[];
}

export type IdentityAnchorType = "CHARACTER" | "LOCATION" | "PROP";
export type AnchorContinuityReason = "RECURRING" | "CRITICAL_CONTINUITY";
export type ProductionPriority = "CRITICAL" | "IMPORTANT" | "SUPPORTING";

export interface IdentitySpecification {
  locked: string[];
  contextual: string[];
  temporary: string[];
}

export interface IdentityAnchor extends BaseEntity, VisualFreshness {
  anchorType: IdentityAnchorType;
  name: string;
  rationale: string;
  continuityReason: AnchorContinuityReason;
  productionPriority: ProductionPriority;
  specification: IdentitySpecification;
  requiredBySceneIds: string[];
  referenceMediaIds: string[];
  sourceProjectStyleId: string;
  sourceProjectStyleRevision: number;
  sourceChannelVisualBibleVersion: string;
}


export type AssetClass =
  | "PRIMARY_SCENE"
  | "EXTRA_START"
  | "SPECIAL_END"
  | "BRIDGE"
  | "REFERENCE";

export type AssetRole = "HERO" | "STORY_ANCHOR" | "STANDARD";
export type AssetSourceStrategy = "GENERATE" | "IMPORT" | "REUSE";
export type AssetOwnerType = "SCENE" | "SEQUENCE" | "LINK";

export type AssetStatus =
  | "PLANNED"
  | "DESIGNED"
  | "GENERATING"
  | "CANDIDATE_AVAILABLE"
  | "QC_PENDING"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "REGENERATE_REQUIRED"
  | "REDESIGN_REQUIRED"
  | "BLOCKED"
  | "SUPERSEDED";

export interface AssetOwner {
  type: AssetOwnerType;
  id: string;
}

export interface AssetDesignSpec {
  visualGoal: string;
  composition: string;
  continuityRequirements: string[];
  identityAnchorIds: string[];
  factualConstraints: string[];
  avoidances: string[];
  imagePrompt?: string;
  negativePrompt?: string;
}

export interface ProductionAsset extends BaseEntity, VisualFreshness {
  assetClass: AssetClass;
  assetRole: AssetRole;
  productionPriority: ProductionPriority;
  sourceStrategy: AssetSourceStrategy;
  owner: AssetOwner;
  stateRef: StateRef;
  design: AssetDesignSpec;
  candidateMediaIds: string[];
  approvedMediaId?: string;
  assetStatus: AssetStatus;
  sourceSceneRevision: number;
  sourceProjectStyleId: string;
  sourceProjectStyleRevision: number;
  sourceIdentityAnchorRevisions: Record<string, number>;
  formatProfileVersion: string;
}

export type MediaType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
export type MediaStatus = "AVAILABLE" | "INVALID" | "MISSING" | "SUPERSEDED";

export interface MediaArtifact extends BaseEntity {
  mediaType: MediaType;
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  checksum: string;
  sourceJobId?: string;
  mediaStatus: MediaStatus;
}

export type ProviderJobType =
  | "IMAGE_GENERATION"
  | "VIDEO_GENERATION"
  | "TTS_GENERATION"
  | "OTHER";

export type ProviderExecutionMode = "AUTOMATED" | "MANUAL_EXTERNAL";

export type ProviderJobStatus =
  | "QUEUED"
  | "READY"
  | "RUNNING"
  | "WAITING_EXTERNAL"
  | "COMPLETE"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED";

export interface ProviderJob extends BaseEntity {
  jobType: ProviderJobType;
  provider: string;
  providerProfileVersion: string;
  targetType: "ASSET" | "CLIP" | "AUDIO";
  targetId: string;
  targetRevision: number;
  executionMode: ProviderExecutionMode;
  status: ProviderJobStatus;
  attempt: number;
  retryOfJobId?: string;
  inputPayload: unknown;
  resultMediaIds: string[];
  errorCode?: string;
  errorDetail?: string;
}

export type QcType =
  | "STRUCTURE_QC"
  | "SCENE_QC"
  | "IMAGE_QC"
  | "HANDOFF_QC"
  | "CLIP_QC"
  | "SEQUENCE_QC"
  | "CHAPTER_QC"
  | "FULL_VIDEO_QC"
  | "BINDING_QC";

export type QcStatus =
  | "PASS"
  | "PASS_WITH_NOTE"
  | "FIXABLE"
  | "REGENERATE"
  | "REDESIGN"
  | "REJECT";

export type QcSeverity = "CRITICAL" | "MAJOR" | "MINOR";

export interface QcResult extends BaseEntity {
  qcType: QcType;
  targetType: "SCENE" | "ASSET" | "LINK" | "CLIP" | "SEQUENCE" | "CHAPTER" | "PROJECT";
  targetId: string;
  targetRevision: number;
  mediaId?: string;
  qcStatus: QcStatus;
  severity: QcSeverity;
  confidence: number;
  symptom?: string;
  rootCause?: string;
  recommendedAction?: string;
  fallback?: string;
}


export type LinkScope =
  | "SEQUENCE_LOCAL"
  | "SEQUENCE_BOUNDARY"
  | "CHAPTER_BOUNDARY"
  | "FULL_VIDEO_PRIMARY";

export type LinkStatus =
  | "NOT_PLANNED"
  | "PRE_LINK_DRAFT"
  | "PRE_LINK_APPROVED"
  | "WAITING_FOR_ASSETS"
  | "HANDOFF_QC_PENDING"
  | "HANDOFF_PASS"
  | "HANDOFF_NEEDS_REVIEW"
  | "FINAL_DESIGN_READY"
  | "IMPLEMENTED"
  | "REWORK_REQUIRED";

export type HandoffChannel = "VISUAL" | "AUDIO" | "EDIT";
export type PreLinkMatch = "MATCH" | "PARTIAL" | "MISMATCH" | "NOT_EVALUATED";

export interface ProductionLink extends BaseEntity, VisualFreshness {
  fromSceneId: string;
  fromSceneRevision: number;
  fromStateRef: StateRef;
  toSceneId: string;
  toSceneRevision: number;
  toStateRef: StateRef;
  linkScope: LinkScope;
  preLinkRequired: boolean;
  continuityLevel: string;
  stateChange: string;
  handoffIntent: string;
  handoffAnchor: string[];
  handoffChannels: HandoffChannel[];
  transitionIntent: string;
  preLinkApprovalId?: string;
  fromAssetId?: string;
  fromAssetRevision?: number;
  fromMediaId?: string;
  toAssetId?: string;
  toAssetRevision?: number;
  toMediaId?: string;
  handoffQcId?: string;
  handoffUsable?: boolean;
  handoffReviewApprovalId?: string;
  implementationType?: "CLIP" | "CUT";
  implementationRefId?: string;
  preLinkMatch: PreLinkMatch;
  linkStatus: LinkStatus;
}


export type ClipMode =
  | "DIRECT_START_END_I2V"
  | "SINGLE_IMAGE_I2V"
  | "EDITORIAL_MOVE"
  | "STATIC_HOLD"
  | "REUSE_REFRAME";

export type TransitionMethod =
  | "DIRECT"
  | "HARD_CUT"
  | "MATCH_CUT"
  | "OBJECT_MATCH"
  | "DIRECTION_MATCH"
  | "OCCLUSION"
  | "SOUND_BRIDGE"
  | "LIGHT_SHIFT"
  | "RESET";

export type ClipStatus =
  | "NOT_DESIGNED"
  | "DESIGNED"
  | "READY"
  | "GENERATING"
  | "CANDIDATE_AVAILABLE"
  | "QC_PENDING"
  | "NEEDS_REVIEW"
  | "APPROVED"
  | "EDITORIAL_FIX_REQUIRED"
  | "REGENERATE_REQUIRED"
  | "FALLBACK_REQUIRED"
  | "BLOCKED"
  | "SUPERSEDED";

export interface ProductionClip extends BaseEntity, VisualFreshness {
  linkId: string;
  linkRevision: number;
  clipMode: ClipMode;
  clipStartStateRef: StateRef;
  clipEndStateTarget: StateRef;
  startAssetId: string;
  startAssetRevision: number;
  startMediaId: string;
  endAssetId?: string;
  endAssetRevision?: number;
  endMediaId?: string;
  transitionMethod: TransitionMethod;
  cameraMove: string;
  subjectMotion: string;
  environmentMotion: string;
  durationMs: number;
  providerExecutionRequired: boolean;
  finalDesignApprovalId?: string;
  providerPreflightId?: string;
  candidateMediaIds: string[];
  approvedMediaId?: string;
  clipStatus: ClipStatus;
}

export type ProviderPreflightStatus =
  | "PASS"
  | "NEEDS_REVIEW"
  | "BLOCKED";

export interface ProviderPreflightRecord extends BaseEntity {
  clipId: string;
  clipRevision: number;
  provider: string;
  providerProfileVersion: string;
  status: ProviderPreflightStatus;
  safetySafe: boolean;
  capabilityCompatible: boolean;
  requiresAlternativeRepresentation: boolean;
  issueCodes: string[];
  recommendedAction?: string;
  decisionId: string;
  reviewApprovalId?: string;
}

export interface LinkCutImplementation extends BaseEntity, VisualFreshness {
  linkId: string;
  linkRevision: number;
  transitionMethod: TransitionMethod;
  rationale: string;
  finalDesignApprovalId?: string;
  ready: boolean;
}

export type ClipQcStatus =
  | "PASS"
  | "TRIM_PASS"
  | "EDITORIAL_FIX"
  | "REGENERATE"
  | "FALLBACK"
  | "BLOCKED";

export interface ClipQcRecord extends BaseEntity {
  clipId: string;
  clipRevision: number;
  candidateMediaId: string;
  status: ClipQcStatus;
  severity: QcSeverity;
  confidence: number;
  usableInMs?: number;
  usableOutMs?: number;
  issues: string[];
  regenerationReason?: string;
  editorialInstruction?: string;
  fallbackReason?: string;
  decisionId: string;
}

export type ClipFallbackAction =
  | "REGENERATE"
  | "EDITORIAL_MOVE"
  | "STATIC_HOLD"
  | "REUSE_REFRAME"
  | "CUT"
  | "ADDITIONAL_ASSET_REQUIRED"
  | "BLOCK";

export interface ClipFallbackRecord extends BaseEntity {
  clipId: string;
  clipRevision: number;
  sourceQcId: string;
  action: ClipFallbackAction;
  rationale: string;
  decisionId: string;
  requiresHumanReview: boolean;
  applied: boolean;
  resultingImplementationType?: "CLIP" | "CUT";
  resultingImplementationRefId?: string;
}

export type AggregateQcStatus = "PASS" | "PARTIAL" | "BLOCKED";

export interface AggregateQcSummary {
  scopeType: "SEQUENCE" | "CHAPTER" | "PROJECT";
  scopeId: string;
  status: AggregateQcStatus;
  readyImplementations: number;
  totalImplementations: number;
  blockedImplementationIds: string[];
  pendingImplementationIds: string[];
}
export type FinalMediaBindingKind = "VIDEO" | "EDITORIAL" | "CUT";
export type FinalMediaBindingStatus = "READY" | "STALE" | "BLOCKED";

export interface FinalMediaBinding extends BaseEntity {
  linkId: string;
  linkRevision: number;
  implementationType: "CLIP" | "CUT";
  implementationId: string;
  implementationRevision: number;
  bindingKind: FinalMediaBindingKind;
  bindingStatus: FinalMediaBindingStatus;
  stale: boolean;
  staleReason?: string;
  clipMode?: ClipMode;
  mediaId?: string;
  sourceAssetId?: string;
  sourceQcId?: string;
  sourceInMs?: number;
  sourceOutMs?: number;
  durationMs: number;
  transitionMethod: TransitionMethod;
  cameraMove?: string;
  subjectMotion?: string;
  environmentMotion?: string;
}

export interface CurrentImplementationRef {
  linkId: string;
  linkRevision: number;
  implementationType: "CLIP" | "CUT";
  implementationId: string;
}

export interface EditorHandoffItem {
  order: number;
  bindingId: string;
  bindingRevision: number;
  linkId: string;
  linkRevision: number;
  implementationType: "CLIP" | "CUT";
  implementationId: string;
  implementationRevision: number;
  bindingKind: FinalMediaBindingKind;
  clipMode?: ClipMode;
  mediaId?: string;
  relativePath?: string;
  sourceInMs?: number;
  sourceOutMs?: number;
  sourceAssetDurationMs?: number;
  durationMs: number;
  transitionMethod: TransitionMethod;
  cameraMove?: string;
  subjectMotion?: string;
  environmentMotion?: string;
}

export type EditorHandoffStatus = "READY" | "PARTIAL" | "BLOCKED";

export interface EditorHandoffManifest {
  schemaVersion: "1.0";
  projectId: string;
  createdAt: string;
  recommendedFileName: "media_binding.json";
  status: EditorHandoffStatus;
  totalImplementations: number;
  boundImplementations: number;
  items: EditorHandoffItem[];
  blockers: Array<{
    implementationType: "CLIP" | "CUT";
    implementationId: string;
    reason: string;
  }>;
}
export type GenericEditorTrackType = "VIDEO" | "AUDIO" | "TEXT" | "GRAPHIC";
export type GenericEditorVisualItemType = "VIDEO" | "IMAGE";

export interface GenericEditorTrack {
  id: string;
  type: GenericEditorTrackType;
  name: string;
  enabled: boolean;
  locked: boolean;
  order: number;
}

export interface GenericEditorProjectMetadata {
  id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}

export interface GenericEditorProjectSettings {
  snapEnabled: boolean;
  snapToleranceFrames: number;
  timelineZoom: number;
  masterVolume: number;
}

export interface GenericEditorBaseVisualItem {
  id: string;
  type: GenericEditorVisualItemType;
  trackId: string;
  timelineStartFrame: number;
  durationInFrames: number;
  enabled: boolean;
  locked: boolean;
  zIndex?: number;
}

export interface GenericEditorVideoItem extends GenericEditorBaseVisualItem {
  type: "VIDEO";
  src: string;
  sourceStartFrame: number;
  sourceDurationInFrames: number;
  sourceAssetDurationInFrames: number;
  playbackRate: number;
  volume: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  fit: "cover" | "contain";
}

export type GenericEditorImageMotionEasing = "LINEAR" | "EASE_IN_OUT";

export interface GenericEditorImageMotionTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface GenericEditorImageMotionSpec {
  kind: "TRANSFORM";
  from: GenericEditorImageMotionTransform;
  to: GenericEditorImageMotionTransform;
  easing: GenericEditorImageMotionEasing;
}

export interface GenericEditorImageItem extends GenericEditorBaseVisualItem {
  type: "IMAGE";
  src: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  fit: "cover" | "contain";
  motion?: GenericEditorImageMotionSpec;
}

export type GenericEditorVisualItem =
  | GenericEditorVideoItem
  | GenericEditorImageItem;

export type GenericEditorAudioItemType =
  | "TTS"
  | "CLIP_AUDIO"
  | "BGM"
  | "SFX";

export interface GenericEditorAudioItem {
  id: string;
  type: GenericEditorAudioItemType;
  trackId: string;
  timelineStartFrame: number;
  durationInFrames: number;
  enabled: boolean;
  locked: boolean;
  zIndex?: number;
  src: string;
  sourceStartFrame: number;
  sourceDurationInFrames: number;
  sourceAssetDurationInFrames: number;
  volume: number;
  muted: boolean;
  fadeInFrames: number;
  fadeOutFrames: number;
  loop?: boolean;
}

export interface GenericEditorTextStyleFields {
  text: string;
  x: number;
  y: number;
  width: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  maxLines: number;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
}

export type GenericEditorSubtitleGenerationSource =
  | "TTS_TRANSCRIBE"
  | "SCRIPT_TTS_ALIGN"
  | "SCRIPT_TIMING"
  | "MANUAL";

export interface GenericEditorSubtitleItem
  extends GenericEditorTextStyleFields {
  id: string;
  type: "SUBTITLE";
  trackId: string;
  timelineStartFrame: number;
  durationInFrames: number;
  enabled: boolean;
  locked: boolean;
  zIndex?: number;
  generationSource?: GenericEditorSubtitleGenerationSource;
  generatedFromTtsIds?: string[];
}

export type GenericEditorTextRole =
  | "TOP_TITLE"
  | "LOWER_THIRD"
  | "SOURCE"
  | "LABEL"
  | "FREE_TEXT";

export interface GenericEditorTextItem
  extends GenericEditorTextStyleFields {
  id: string;
  type: "TEXT";
  trackId: string;
  timelineStartFrame: number;
  durationInFrames: number;
  enabled: boolean;
  locked: boolean;
  zIndex?: number;
  textRole: GenericEditorTextRole;
}

export type GenericEditorGraphicType =
  | "BLUR_PANEL"
  | "GRADIENT"
  | "SOLID_PANEL"
  | "DIM_LAYER";

export interface GenericEditorGraphicItem {
  id: string;
  type: "GRAPHIC";
  trackId: string;
  timelineStartFrame: number;
  durationInFrames: number;
  enabled: boolean;
  locked: boolean;
  zIndex?: number;
  graphicType: GenericEditorGraphicType;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blurPx: number;
  backgroundColor: string;
  borderRadius: number;
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngleDeg?: number;
}

export type GenericEditorTimelineItem =
  | GenericEditorVisualItem
  | GenericEditorAudioItem
  | GenericEditorSubtitleItem
  | GenericEditorTextItem
  | GenericEditorGraphicItem;

export interface GenericEditProject {
  schemaVersion: 1;
  project: GenericEditorProjectMetadata;
  tracks: GenericEditorTrack[];
  items: GenericEditorTimelineItem[];
  settings: GenericEditorProjectSettings;
}

export type EditorContentPlanStatus = "DRAFT" | "APPROVED";

export interface EditorAudioPlacement {
  id: string;
  type: GenericEditorAudioItemType;
  mediaId: string;
  timelineStartMs: number;
  sourceInMs?: number;
  sourceOutMs?: number;
  durationMs?: number;
  volume?: number;
  muted?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  loop?: boolean;
}

export interface EditorSubtitleStyle {
  x?: number;
  y?: number;
  width?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  maxLines?: number;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
}

export interface EditorSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  generationSource?: GenericEditorSubtitleGenerationSource;
  generatedFromAudioPlacementIds?: string[];
  style?: EditorSubtitleStyle;
}

export interface EditorTextOverlay {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  textRole: GenericEditorTextRole;
  x: number;
  y: number;
  width: number;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  maxLines?: number;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  zIndex?: number;
}

export interface EditorGraphicOverlay {
  id: string;
  startMs: number;
  endMs: number;
  graphicType: GenericEditorGraphicType;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  blurPx?: number;
  backgroundColor: string;
  borderRadius?: number;
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngleDeg?: number;
  zIndex?: number;
}

export interface EditorContentPlan extends BaseEntity {
  planStatus: EditorContentPlanStatus;
  audio: EditorAudioPlacement[];
  subtitles: EditorSubtitleCue[];
  textOverlays: EditorTextOverlay[];
  graphics: EditorGraphicOverlay[];
}

export interface EditorContentPlanRef {
  contentPlanId: string;
  contentPlanRevision: number;
}

export interface EditorCutBoundary {
  order: number;
  timelineFrame: number;
  linkId: string;
  implementationId: string;
  transitionMethod: TransitionMethod;
}

export interface EditorMotionDirective {
  itemId: string;
  bindingId: string;
  clipMode: "EDITORIAL_MOVE" | "REUSE_REFRAME";
  cameraMove?: string;
  subjectMotion?: string;
  environmentMotion?: string;
  supportedByCurrentRenderer: boolean;
  compiledMotion?: GenericEditorImageMotionSpec;
}

export type TimelineAssemblyStatus = "READY" | "PARTIAL" | "BLOCKED";

export interface TimelineAssemblyRecord extends BaseEntity {
  sourceBindingRefs: Array<{
    bindingId: string;
    bindingRevision: number;
  }>;
  sourceContentPlanRef?: EditorContentPlanRef;
  fps: number;
  width: number;
  height: number;
  assemblyStatus: TimelineAssemblyStatus;
  stale: boolean;
  staleReason?: string;
  editProject: GenericEditProject;
  cutBoundaries: EditorCutBoundary[];
  motionDirectives: EditorMotionDirective[];
  blockers: string[];
}

export interface TimelineAssemblyOutput {
  schemaVersion: "1.0";
  projectId: string;
  createdAt: string;
  recommendedFileName: "edit_project.json";
  status: TimelineAssemblyStatus;
  editProject: GenericEditProject;
  cutBoundaries: EditorCutBoundary[];
  motionDirectives: EditorMotionDirective[];
  blockers: string[];
}
