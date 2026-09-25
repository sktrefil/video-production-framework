export type EtaConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface EtaRange {
  min_sec: number;
  max_sec: number;
  confidence: EtaConfidence;
  source: "DEFAULT" | "PROGRESS" | "ITEM_RATE";
}

export interface ItemProgressEstimateInput {
  completed: number;
  total: number;
}

export const DEFAULT_TASK_ETA_SEC: Readonly<Record<string, readonly [number, number]>> =
  Object.freeze({
    T010: [120, 300],
    T020: [180, 480],
    T030: [60, 300],
    T040: [120, 300],
    T050: [120, 300],
    T060: [120, 360],
    T070: [600, 1800],
    T080: [0, 0],
    T090: [300, 1200],
    T100: [120, 300]
  });

function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function rangeAround(value: number, spread: number, confidence: EtaConfidence, source: EtaRange["source"]): EtaRange {
  const center = clampSeconds(value);
  return {
    min_sec: clampSeconds(center * (1 - spread)),
    max_sec: clampSeconds(center * (1 + spread)),
    confidence,
    source
  };
}

export function estimateTaskRemaining(
  taskId: string,
  elapsedSec: number,
  percent: number,
  itemProgress?: ItemProgressEstimateInput
): EtaRange | null {
  if (taskId === "T080") return null;

  const elapsed = clampSeconds(elapsedSec);
  if (
    itemProgress !== undefined &&
    itemProgress.total > 0 &&
    itemProgress.completed > 0 &&
    itemProgress.completed <= itemProgress.total
  ) {
    const remainingItems = Math.max(0, itemProgress.total - itemProgress.completed);
    const averageSec = elapsed / itemProgress.completed;
    const confidence: EtaConfidence =
      itemProgress.completed >= 5 ? "HIGH" :
      itemProgress.completed >= 2 ? "MEDIUM" :
      "LOW";
    const spread = confidence === "HIGH" ? 0.2 : confidence === "MEDIUM" ? 0.3 : 0.45;
    return rangeAround(averageSec * remainingItems, spread, confidence, "ITEM_RATE");
  }

  const boundedPercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, percent))
    : 0;
  if (elapsed > 0 && boundedPercent >= 10 && boundedPercent < 100) {
    const projectedRemaining = elapsed * ((100 - boundedPercent) / boundedPercent);
    const confidence: EtaConfidence = boundedPercent >= 60 ? "HIGH" : boundedPercent >= 30 ? "MEDIUM" : "LOW";
    const spread = confidence === "HIGH" ? 0.25 : confidence === "MEDIUM" ? 0.35 : 0.5;
    return rangeAround(projectedRemaining, spread, confidence, "PROGRESS");
  }

  const fallback = DEFAULT_TASK_ETA_SEC[taskId];
  if (fallback === undefined) return null;
  return {
    min_sec: Math.max(0, fallback[0] - elapsed),
    max_sec: Math.max(0, fallback[1] - elapsed),
    confidence: "LOW",
    source: "DEFAULT"
  };
}

export function combineEtaRanges(ranges: Array<EtaRange | null>): EtaRange | null {
  const available = ranges.filter((item): item is EtaRange => item !== null);
  if (available.length === 0) return null;

  const confidence: EtaConfidence =
    available.every(item => item.confidence === "HIGH") ? "HIGH" :
    available.some(item => item.confidence === "LOW") ? "LOW" :
    "MEDIUM";

  return {
    min_sec: available.reduce((sum, item) => sum + item.min_sec, 0),
    max_sec: available.reduce((sum, item) => sum + item.max_sec, 0),
    confidence,
    source: available.every(item => item.source === "ITEM_RATE")
      ? "ITEM_RATE"
      : available.some(item => item.source === "PROGRESS")
        ? "PROGRESS"
        : "DEFAULT"
  };
}
