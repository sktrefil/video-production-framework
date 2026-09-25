import {
  calculateOverallProgress,
  type ProductionProgressEvent
} from "./production-progress.js";

export interface TerminalProgressTaskSnapshot {
  task_id: string;
  status: string;
}

export type TerminalProgressSink = (line: string) => void;

const TASK_LABELS: Readonly<Record<string, string>> = Object.freeze({
  T010: "Research / Fact Check",
  T020: "Story / Script",
  T030: "TTS / Timing",
  T040: "Visual Scene Plan",
  T050: "State Image Plan",
  T060: "Clip / Camera Plan",
  T070: "Image Generation / QC",
  T080: "Video Generation / QC",
  T090: "Editorial Assembly",
  T100: "Final Cinematic QC"
});

function formatPercent(value: number): string {
  return value.toFixed(value % 1 === 0 ? 0 : 1).padStart(5, " ");
}

function phaseLabel(phase?: string): string {
  if (!phase) return "";
  const labels: Readonly<Record<string, string>> = {
    PREFLIGHT: "Preflight",
    RUNTIME_EXECUTION: "Runtime",
    WORKER_OUTPUT_READY: "Output ready",
    DETERMINISTIC_GATE_PASS: "Gate passed",
    CODEX1_SUCCESS_QC: "Codex1 QC",
    CODEX1_FAILURE_REVIEW: "Codex1 review",
    MANAGER_QC_COMPLETE: "Manager QC complete",
    COMPLETE: "Complete"
  };
  return labels[phase] ?? phase.replaceAll("_", " ");
}

export class ProductionTerminalProgressRenderer {
  private readonly completedTasks = new Set<string>();
  private activeTaskId: string | null = null;
  private activeTaskPercent = 0;

  constructor(
    initialTasks: readonly TerminalProgressTaskSnapshot[],
    private readonly sink: TerminalProgressSink
  ) {
    for (const task of initialTasks) {
      if (task.status === "COMPLETE") this.completedTasks.add(task.task_id);
    }
  }

  handle(event: ProductionProgressEvent): void {
    switch (event.event) {
      case "RUN_STARTED":
        this.write(
          this.overall(),
          "RUN",
          phaseLabel(event.phase),
          event.message ?? "Production started."
        );
        return;

      case "TASK_STARTED":
        if (event.task_id) {
          this.activeTaskId = event.task_id;
          this.activeTaskPercent = 0;
        }
        this.write(
          this.overall(),
          event.task_id ?? "TASK",
          "START",
          this.taskDescription(event.task_id, event.attempt)
        );
        return;

      case "TASK_PROGRESS":
        if (event.task_id) {
          this.activeTaskId = event.task_id;
          this.activeTaskPercent = event.percent ?? 0;
        }
        this.write(
          this.overall(),
          event.task_id ?? "TASK",
          event.percent === undefined ? phaseLabel(event.phase) : `${formatPercent(event.percent)}%`,
          [phaseLabel(event.phase), event.message].filter(Boolean).join(" · ")
        );
        return;

      case "QC_STARTED":
        this.write(
          this.overall(),
          event.task_id ?? "QC",
          "QC",
          `${phaseLabel(event.phase)} started`
        );
        return;

      case "QC_COMPLETED":
        this.write(
          this.overall(),
          event.task_id ?? "QC",
          event.verdict ?? "QC",
          `${phaseLabel(event.phase)} completed`
        );
        return;

      case "TASK_RETRY":
        if (event.task_id) {
          this.activeTaskId = event.task_id;
          this.activeTaskPercent = 0;
        }
        this.write(
          this.overall(),
          event.task_id ?? "TASK",
          "RETRY",
          [event.attempt === undefined ? "" : `attempt ${event.attempt}`, event.message]
            .filter(Boolean)
            .join(" · ")
        );
        return;

      case "TASK_COMPLETED":
        if (event.task_id) this.completedTasks.add(event.task_id);
        if (this.activeTaskId === event.task_id) {
          this.activeTaskId = null;
          this.activeTaskPercent = 0;
        }
        this.write(
          this.overall(),
          event.task_id ?? "TASK",
          "DONE",
          event.message ?? "Task completed."
        );
        return;

      case "HANDOFF":
        this.write(
          this.overall(),
          event.next_task ?? "HANDOFF",
          "NEXT",
          event.next_agent ?? event.message ?? "Handoff"
        );
        return;

      case "RUN_BLOCKED":
        this.write(
          this.overall(),
          event.task_id ?? "RUN",
          "BLOCKED",
          event.message ?? "Production blocked."
        );
        return;

      case "RUN_FINISHED":
        this.write(
          this.overall(),
          event.next_task ?? "RUN",
          "FINISHED",
          event.message ?? "Production run finished."
        );
        return;
    }
  }

  private overall(): number {
    return calculateOverallProgress(
      this.completedTasks,
      this.activeTaskId === null
        ? undefined
        : { task_id: this.activeTaskId, percent: this.activeTaskPercent }
    );
  }

  private taskDescription(taskId?: string, attempt?: number): string {
    const label = taskId === undefined ? "Task" : TASK_LABELS[taskId] ?? taskId;
    return attempt === undefined ? label : `${label} · attempt ${attempt}/3`;
  }

  private write(
    overall: number,
    stage: string,
    state: string,
    detail: string
  ): void {
    this.sink(
      `[VPF ${formatPercent(overall)}%] ${stage.padEnd(4, " ")} ${state.padEnd(8, " ")} ${detail}`
    );
  }
}
