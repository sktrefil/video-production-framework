import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";
import type { ProductionProgressEvent } from "./production-progress.js";

export interface ProductionDashboardLiveState {
  run_started_at: string | null;
  last_event: ProductionProgressEvent | null;
  recent_events: ProductionProgressEvent[];
  task_progress: Record<string, {
    percent: number;
    phase: string | null;
    agent: string | null;
    attempt: number | null;
    elapsed_sec: number | null;
    runtime_last_activity_age_sec: number | null;
    runtime_pid: number | null;
    at: string;
  }>;
}

type DashboardListener = (event: ProductionProgressEvent) => void;

export class ProductionDashboardHub {
  private readonly listeners = new Set<DashboardListener>();
  private readonly recent: ProductionProgressEvent[] = [];
  private readonly taskProgress = new Map<string, ProductionDashboardLiveState["task_progress"][string]>();
  private lastEvent: ProductionProgressEvent | null = null;
  private runStartedAt: string | null = null;
  private logQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly eventLogPath?: string,
    private readonly recentLimit = 200
  ) {}

  publish(event: ProductionProgressEvent): void {
    this.lastEvent = event;
    if (event.event === "RUN_STARTED") this.runStartedAt = event.at;
    if (event.task_id !== undefined) {
      const current = this.taskProgress.get(event.task_id);
      this.taskProgress.set(event.task_id, {
        percent:
          event.event === "TASK_COMPLETED"
            ? 100
            : event.percent ?? current?.percent ?? 0,
        phase: event.phase ?? current?.phase ?? null,
        agent: event.agent ?? current?.agent ?? null,
        attempt: event.attempt ?? current?.attempt ?? null,
        elapsed_sec: event.elapsed_sec ?? current?.elapsed_sec ?? null,
        runtime_last_activity_age_sec:
          event.runtime_last_activity_age_sec ??
          current?.runtime_last_activity_age_sec ??
          null,
        runtime_pid: event.runtime_pid ?? current?.runtime_pid ?? null,
        at: event.at
      });
    }

    this.recent.push(event);
    while (this.recent.length > this.recentLimit) this.recent.shift();

    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        this.listeners.delete(listener);
      }
    }

    if (this.eventLogPath !== undefined) {
      const line = JSON.stringify(event) + "\n";
      this.logQueue = this.logQueue
        .then(async () => {
          await mkdir(path.dirname(this.eventLogPath!), { recursive: true });
          await appendFile(this.eventLogPath!, line, "utf8");
        })
        .catch(() => undefined);
    }
  }

  subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): ProductionDashboardLiveState {
    return {
      run_started_at: this.runStartedAt,
      last_event: this.lastEvent === null ? null : structuredClone(this.lastEvent),
      recent_events: structuredClone(this.recent),
      task_progress: Object.fromEntries(
        [...this.taskProgress.entries()].map(([taskId, progress]) => [taskId, { ...progress }])
      )
    };
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  async flush(): Promise<void> {
    await this.logQueue;
  }
}
