export type ProductionProgressEventType =
  | "RUN_STARTED"
  | "TASK_STARTED"
  | "TASK_PROGRESS"
  | "QC_STARTED"
  | "QC_COMPLETED"
  | "TASK_RETRY"
  | "TASK_COMPLETED"
  | "HANDOFF"
  | "RUN_BLOCKED"
  | "RUN_FINISHED";

export type ProgressQcKind = "SUCCESS" | "FAILURE";

export const PRODUCTION_TASK_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  T010: 8,
  T020: 12,
  T030: 10,
  T040: 8,
  T050: 8,
  T060: 8,
  T070: 18,
  T080: 18,
  T090: 5,
  T100: 5
});

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function calculateOverallProgress(
  completedTaskIds: Iterable<string>,
  activeTask?: { task_id: string; percent: number }
): number {
  const completed = new Set(completedTaskIds);
  let total = 0;

  for (const taskId of completed) {
    total += PRODUCTION_TASK_WEIGHTS[taskId] ?? 0;
  }

  if (activeTask !== undefined && !completed.has(activeTask.task_id)) {
    const weight = PRODUCTION_TASK_WEIGHTS[activeTask.task_id] ?? 0;
    total += weight * (clampPercent(activeTask.percent) / 100);
  }

  return Number(clampPercent(total).toFixed(1));
}

export interface ProductionProgressEvent {
  schema_version: "1.0";
  sequence: number;
  event: ProductionProgressEventType;
  project_id: string;
  at: string;
  task_id?: string;
  agent?: string;
  attempt?: number;
  phase?: string;
  completed?: number;
  total?: number;
  percent?: number;
  qc_kind?: ProgressQcKind;
  verdict?: string;
  next_task?: string | null;
  next_agent?: string | null;
  message?: string;
  elapsed_sec?: number;
  runtime_last_activity_age_sec?: number;
  runtime_pid?: number | null;
}

export type ProductionProgressEventInput = Omit<
  ProductionProgressEvent,
  "schema_version" | "sequence" | "at"
>;

export type ProductionProgressSink = (
  event: ProductionProgressEvent
) => void | Promise<void>;

const defaultClock = (): string => new Date().toISOString();

export class ProductionProgressReporter {
  private sequence = 0;

  constructor(
    private readonly sink: ProductionProgressSink = () => undefined,
    private readonly clock: () => string = defaultClock
  ) {}

  async emit(input: ProductionProgressEventInput): Promise<ProductionProgressEvent> {
    const event: ProductionProgressEvent = {
      schema_version: "1.0",
      sequence: ++this.sequence,
      at: this.clock(),
      ...input
    };

    try {
      await this.sink(event);
    } catch {
      // Progress reporting is observational. A broken renderer or consumer
      // must never mutate or stop the production workflow itself.
    }

    return event;
  }

  async taskProgress(input: {
    project_id: string;
    task_id: string;
    agent?: string;
    attempt?: number;
    phase?: string;
    completed: number;
    total: number;
    message?: string;
    elapsed_sec?: number;
    runtime_last_activity_age_sec?: number;
    runtime_pid?: number | null;
  }): Promise<ProductionProgressEvent> {
    const total = Math.max(0, input.total);
    const completed = Math.max(0, Math.min(input.completed, total));
    const percent = total === 0
      ? 0
      : Number(((completed / total) * 100).toFixed(1));

    return await this.emit({
      event: "TASK_PROGRESS",
      ...input,
      completed,
      total,
      percent
    });
  }
}

