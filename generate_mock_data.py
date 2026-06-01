"""
scripts/generate_mock_data.py
 
Mock data generator for the Ultralytics Platform validation prototype.
 
The Ultralytics package covers TWO of the three data layers we need:
 
  Layer 1 — Aggregate run metrics (fully covered by model.val())
  ─────────────────────────────────────────────────────────────
    results = model.val(data="coco8.yaml")
    results.box.map50           # dataset-wide mAP50
    results.box.maps            # per-class mAP50-95 list
    results.confusion_matrix    # NxN matrix
 
  Layer 2 — Per-image summary counts (covered by results.box.image_metrics)
  ─────────────────────────────────────────────────────────────────────────
    results.box.image_metrics
    # → {"val/img001.jpg": {"precision": 0.85, "recall": 0.92,
    #                       "f1": 0.88, "tp": 17, "fp": 3, "fn": 1}, ...}
    # Gives us: score, truePositives, falsePositives, falseNegatives per image.
 
  Layer 3 — Per-box detail (NOT covered; requires additional work)
  ───────────────────────────────────────────────────────────────
  model.val() and image_metrics give no bounding box coordinates,
  no per-detection confidence scores, and no error type classification.
  Getting those requires:
 
    for img_path in val_images:
        preds   = model.predict(img_path)           # predicted boxes + confidences
        gt_boxes = load_yolo_labels(img_path)       # ground truth from .txt files
        matched  = match_boxes(preds, gt_boxes,     # IoU matching at 0.5 threshold
                               iou_thresh=0.5)
        for pred, gt, iou_val in matched:
            error_type = classify_error(pred, gt, iou_val)
            # → "false_positive" | "false_negative" |
            #   "localization"   | "classification"
 
  This script simulates Layer 1 + Layer 2 + Layer 3 together so the
  prototype has realistic fixture data without requiring a GPU, a model
  download, or a dataset on disk.
 
─── What this script actually mocks ───────────────────────────────────────────
 
  Mocked (no real model):   Layer 3 — individual box coordinates, confidences,
                            error-type classification, IoU values.
  Also mocked:              Layer 1 + 2 — derived from the simulated boxes
                            rather than from a real model run.
 
  In production, replace this script with scripts/build_fixtures_real.py
  (not yet implemented), which calls model.val() for Layers 1+2 and
  model.predict() + label loading for Layer 3, then writes the same
  three JSON files with the same schema.
 
Outputs (created automatically):
    data/fixtures/run_001.json        ValidationRun + aggregate metrics
    data/fixtures/images.json         Full ImageResult array (predictions + GTs)
    data/fixtures/images_index.json   Lightweight ImageListItem array
"""

import json
import random
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def random_bbox(small: bool = False) -> list[float]:
    """Generate a random normalised bounding box guaranteed to fit in [0, 1].
    
    Args:
        small: custom classification for a detected object. Helpful for pattern discovery
                among failed cases;
    """
    if small:
        w = random.uniform(0.02, 0.08)
        h = random.uniform(0.02, 0.08)
    else:
        w = random.uniform(0.07, 0.42)
        h = random.uniform(0.07, 0.42)
    cx = random.uniform(w / 2, 1 - w / 2)
    cy = random.uniform(h / 2, 1 - h / 2)
    return [cx, cy, w, h]

def jitter_bbox(box: list[float], jitter: float = 0.06) -> list[float]:
    """
        Small Gaussian perturbation → high IoU (0.7-0.99)
        Simulates a well-localised true positive detection.
    """
    cx, cy, w, h = box
    cx = cx + random.gauss(0, w * jitter)
    cy = cy + random.gauss(0, h * jitter)
    w  = max(0.01, w * random.uniform(1 - jitter, 1 + jitter))
    h  = max(0.01, h * random.uniform(1 - jitter, 1 + jitter))
    cx = max(w / 2, min(1 - w / 2, cx))
    cy = max(h / 2, min(1 - h / 2, cy))
    return [cx, cy, w, h]
 
def displace_bbox(box: list[float], drift: float = 0.38) -> list[float]:
    """
        Larger uniform shift → IoU typically in 0.15-0.45 range.
        Simulates a localisation error (detected but poorly framed).
    """
    cx, cy, w, h = box
    cx = cx + random.uniform(-w * drift, w * drift)
    cy = cy + random.uniform(-h * drift, h * drift)
    w  = max(0.01, w * random.uniform(0.60, 1.40))
    h  = max(0.01, h * random.uniform(0.60, 1.40))
    cx = max(w / 2, min(1 - w / 2, cx))
    cy = max(h / 2, min(1 - h / 2, cy))
    return [cx, cy, w, h]

def compute_iou(b1: list[float], b2: list[float]) -> float:
    """Compute IoU of two normalised [cx, cy, w, h] boxes."""
    x1a, y1a = b1[0] - b1[2] / 2, b1[1] - b1[3] / 2
    x2a, y2a = b1[0] + b1[2] / 2, b1[1] + b1[3] / 2
    x1b, y1b = b2[0] - b2[2] / 2, b2[1] - b2[3] / 2
    x2b, y2b = b2[0] + b2[2] / 2, b2[1] + b2[3] / 2
    iw = max(0.0, min(x2a, x2b) - max(x1a, x1b))
    ih = max(0.0, min(y2a, y2b) - max(y1a, y1b))
    inter = iw * ih
    union = b1[2] * b1[3] + b2[2] * b2[3] - inter
    return inter / union if union > 0 else 0.0