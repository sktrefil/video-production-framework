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
  approvalState: ApprovalState;
}

export interface Chapter extends BaseEntity {
  displayNumber: number;
  title: string;
  sequenceIds: string[];
}

export interface Sequence extends BaseEntity {
  chapterId: string;
  displayNumber: number;
  title: string;
  storyPurpose: string;
  sceneIds: string[];
}

export interface Scene extends BaseEntity {
  sequenceId: string;
  displayNumber: number;
  scriptSegment: string;
  stateIn: string;
  stateCurrent: string;
  stateOut: string;
  primaryVisualIdea: string;
  mustBeSeen: string[];
  canBeNarrated: string[];
  canBeImplied: string[];
  requiredIdentityAnchorIds: string[];
  primaryAssetId?: string;
}

export interface ProjectRecord extends BaseEntity {
  title: string;
  format: ProjectFormat;
  versions: VersionPins;
}
