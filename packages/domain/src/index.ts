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
  | "ASSET"
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
