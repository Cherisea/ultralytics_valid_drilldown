/**
 * Full data model for the Ultralytics Platform validation prototype.
 * All bounding boxes use normalised YOLO format: [cx, cy, w, h] where values
 * are in [0, 1] relative to the image dimensions.
 *
 * This file is the single source of truth for the frontend ↔ API contract.
 * The Python Pydantic models in backend/models.py mirror these types exactly.
 */
 
// ---------------------------------------------------------------------------
// Error taxonomy
// The five failure modes a YOLO model can produce, from most to least severe:
// ---------------------------------------------------------------------------
export type ErrorType =
  | "false_positive"   // Predicted box with no matching GT (hallucinated object)
  | "false_negative"   // GT with no matching prediction (missed object)
  | "localization"     // Right class, IoU < 0.5 (detected but poorly framed)
  | "classification"   // Right location, wrong class (confused label)
  | "duplicate";       // Redundant prediction suppressed by NMS

// ---------------------------------------------------------------------------
// Shared bounding box definition
// ---------------------------------------------------------------------------
export interface BBox {
    x: number;   // centre-x, normalised [0, 1]
    y: number;   // centre-y, normalised [0, 1]
    w: number;   // width, normalised [0, 1]
    h: number;   // height, normalised [0, 1]
}

  // ---------------------------------------------------------------------------
// Detection — a single model prediction on an image
// ---------------------------------------------------------------------------
export interface Detection {
    id: string;
    classId: number;
    className: string;
    confidence: number;           // [0, 1]
    bbox: BBox;
    matched: boolean;             // true → IoU ≥ 0.5 with a GT of the same class
    iou: number;                  // IoU with the best-matching GT (0 if no match)
    errorType: ErrorType | null;  // null for true positives
    groundTruthId: string | null; // link back to the GT this prediction corresponds to
}

// ---------------------------------------------------------------------------
// GroundTruth — a single annotated object in an image
// ---------------------------------------------------------------------------
export interface GroundTruth {
    id: string;
    classId: number;
    className: string;
    bbox: BBox;
    matched: boolean;                   // true → a TP prediction claimed this GT
    matchedPredictionId: string | null;
    // Diagnostic fields: even when unmatched we record the closest prediction
    nearestPredictionId: string | null;
    nearestPredictionIou: number | null;
    // null for matched GTs; the failure mode for unmatched ones
    errorType: "false_negative" | "localization" | "classification" | null;
}

// ImageResult — full per-image validation result
// ---------------------------------------------------------------------------
export interface ImageResult {
  id: string;
  runId: string;
  filename: string;
  imageUrl: string;
  width: number;    // pixels
  height: number;   // pixels
 
  // F1 score
  score: number;
 
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  dominantErrorType: ErrorType | null; // highest-count error on this image
 
  classesPresent: string[];  // class names of GT objects present
  tags: string[];            // e.g. "small_objects", "crowded"
 
  predictions: Detection[];
  groundTruths: GroundTruth[];
}

/**
 * Lightweight image summary for list / gallery views.
 * Strips predictions + groundTruths to keep payloads small.
 */
export type ImageListItem = Omit<ImageResult, "predictions" | "groundTruths">;