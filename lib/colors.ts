/**
 * A shared palette helper for the validation UI that ties YOLO error types to consistent 
 * hex colors and labels so badges, gallery cards, box overlayes and charts could
 * refer to a single source of truth.
 * 
 */

import type { ErrorType } from "@/types/validation";

/** Maps each error type (and null = TP) to its semantic accent color. */
export const ERROR_COLOR: Record<string, string> = {
  false_positive: "#EF4444",
  false_negative: "#F97316",
  localization:   "#EAB308",
  classification: "#A855F7",
  duplicate:      "#06B6D4",
  tp:             "#22C55E",  // null errorType → true positive
};

/** Human-readable label for each error type. */
export const ERROR_LABEL: Record<string, string> = {
  false_positive: "False Positive",
  false_negative: "False Negative",
  localization:   "Localization",
  classification: "Classification",
  duplicate:      "Duplicate",
  tp:             "Correct",
};

/** Returns the hex color for an error type. null → TP green. */
export function errorColor(errorType: ErrorType | string | null): string {
  if (errorType === null) return ERROR_COLOR.tp ?? "#22C55E";
  return ERROR_COLOR[errorType] ?? "#9090A8";
}

/** Returns a display-friendly label for an error type. null → "Correct". */
export function errorLabel(errorType: ErrorType | string | null): string {
  if (errorType === null) return ERROR_LABEL.tp ?? "Correct";
  return ERROR_LABEL[errorType] ?? errorType;
}

/** Maps a per-image score [0,1] to a traffic-light color. */
export function scoreColor(score: number): string {
  if (score < 0.4)  return "#EF4444";
  if (score < 0.6)  return "#F97316";
  if (score < 0.75) return "#EAB308";
  return "#22C55E";
}
