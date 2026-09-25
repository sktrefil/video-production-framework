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

export const NOOP_PROGRESS_REPORTER = new ProductionProgressReporter();
