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

# ── Reproducibility ────────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
 
# ── Config ─────────────────────────────────────────────────────────────────────
N_IMAGES = 60
IOU_THRESHOLD = 0.50  # COCO standard: IoU ≥ 0.5 → true positive
 
# Weighted image-size pool (most images are standard 640×480)
IMAGE_SIZES = [
    (640, 480), (640, 480), (640, 480),
    (1280, 720), (640, 640), (800, 600),
]

# base_recall     – P(model detects this GT instance at all)
# base_precision  – P(detected instance is correctly classified AND well-localised)
# confuses_with   – class IDs the model frequently predicts instead (wrong class)
# small           – instances tend to appear small; use small bounding-box distribution
CLASSES: list[dict] = [
    {"id": 0,  "name": "person",        "base_recall": 0.79, "base_precision": 0.82, "confuses_with": [],     "small": False},
    {"id": 1,  "name": "bicycle",       "base_recall": 0.68, "base_precision": 0.71, "confuses_with": [3],    "small": False},
    {"id": 2,  "name": "car",           "base_recall": 0.83, "base_precision": 0.85, "confuses_with": [4, 5], "small": False},
    {"id": 3,  "name": "motorcycle",    "base_recall": 0.70, "base_precision": 0.74, "confuses_with": [1],    "small": False},
    {"id": 4,  "name": "bus",           "base_recall": 0.76, "base_precision": 0.79, "confuses_with": [2],    "small": False},
    {"id": 5,  "name": "truck",         "base_recall": 0.72, "base_precision": 0.77, "confuses_with": [2],    "small": False},
    {"id": 6,  "name": "traffic light", "base_recall": 0.55, "base_precision": 0.62, "confuses_with": [],     "small": True},
    {"id": 7,  "name": "stop sign",     "base_recall": 0.61, "base_precision": 0.68, "confuses_with": [],     "small": False},
    {"id": 8,  "name": "dog",           "base_recall": 0.76, "base_precision": 0.80, "confuses_with": [9],    "small": False},
    {"id": 9,  "name": "cat",           "base_recall": 0.73, "base_precision": 0.78, "confuses_with": [8],    "small": False},
    {"id": 10, "name": "bird",          "base_recall": 0.39, "base_precision": 0.48, "confuses_with": [],     "small": True},
]
 
N_CLASSES = len(CLASSES)
CLASS_BY_ID: dict[int, dict] = {c["id"]: c for c in CLASSES}

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

def bbox_to_dict(box: list[float]) -> dict[str, float]:
    return {"x": box[0], "y": box[1], "w": box[2], "h": box[3]}

def generate_image(run_id: str, idx: int) -> dict[str, Any]:
    """
    Simulate the full model output for one validation image.
 
    Decision tree per ground truth instance
    ──────────────────────────────
    1. Roll ≤ base_recall? → MISSED (false negative)
    2. Roll → one of:
       a. True positive       jitter_bbox, same class, IoU ≥ 0.5, high conf
       b. Localisation error  displace_bbox, same class, IoU < 0.5, med conf
       c. Classification err  jitter_bbox, wrong class, IoU ≥ 0.5, med conf
    3. Sprinkle spurious false positives (unrelated to any GT)
    """
    img_id   = str(uuid.uuid4())
    w_px, h_px = random.choice(IMAGE_SIZES)
    filename   = f"val_{idx:04d}.jpg"
    # picsum.photos/seed/<seed>/<w>/<h> gives a deterministic image
    image_url  = f"https://picsum.photos/seed/coco{idx}/{w_px}/{h_px}"
 
    # Sample 1–4 distinct classes for this image
    n_cls         = random.choices([1, 2, 3, 4], weights=[30, 40, 20, 10])[0]
    present_cls   = random.sample(CLASSES, min(n_cls, N_CLASSES))
 
    ground_truths: list[dict] = []
    predictions:   list[dict] = []
 
    for cls in present_cls:
        n_inst = random.choices([1, 2, 3, 4], weights=[50, 30, 15, 5])[0]
 
        for _ in range(n_inst):
            gt_id  = str(uuid.uuid4())
            gt_box = random_bbox(small=cls["small"])
 
            # ── Step 1: missed entirely? ─────────────────────────────────────
            if random.random() > cls["base_recall"]:
                ground_truths.append({
                    "id":                  gt_id,
                    "classId":             cls["id"],
                    "className":           cls["name"],
                    "bbox":                bbox_to_dict(gt_box),
                    "matched":             False,
                    "matchedPredictionId": None,
                    "nearestPredictionId": None,
                    "nearestPredictionIou": 0.0,
                    "errorType":           "false_negative",
                })
                continue
 
            # ── Step 2: what kind of detection? ─────────────────────────────
            # Probability budget partitioned from base_precision:
            #   tp_prob + loc_prob + cls_err_prob ≤ base_precision
            loc_prob     = 0.08
            cls_err_prob = 0.05 if cls["confuses_with"] else 0.0
            tp_prob      = max(0.0, cls["base_precision"] - loc_prob - cls_err_prob)
 
            r = random.random()
 
            if r < tp_prob:
                # True positive — correct class, well-localised
                pred_box      = jitter_bbox(gt_box)
                pred_class_id = cls["id"]
                iou_val       = compute_iou(gt_box, pred_box)
                conf          = round(random.uniform(0.60, 0.95), 4)
                error_type    = None
 
            elif r < tp_prob + loc_prob:
                # Localisation error — right class, poor overlap
                pred_box      = displace_bbox(gt_box)
                pred_class_id = cls["id"]
                iou_val       = compute_iou(gt_box, pred_box)
                conf          = round(random.uniform(0.35, 0.65), 4)
                error_type    = "localization"
 
            elif r < tp_prob + loc_prob + cls_err_prob:
                # Classification error — right location, wrong class label
                pred_box      = jitter_bbox(gt_box)
                pred_class_id = random.choice(cls["confuses_with"])
                iou_val       = compute_iou(gt_box, pred_box)
                conf          = round(random.uniform(0.40, 0.70), 4)
                error_type    = "classification"
 
            else:
                # Remaining probability mass → treat as TP
                pred_box      = jitter_bbox(gt_box)
                pred_class_id = cls["id"]
                iou_val       = compute_iou(gt_box, pred_box)
                conf          = round(random.uniform(0.60, 0.95), 4)
                error_type    = None
 
            # Standard COCO matching rule:
            # TP ↔ same class AND IoU ≥ 0.5; classification errors never match
            matched = (iou_val >= IOU_THRESHOLD) and (error_type != "classification")
            pred_id = str(uuid.uuid4())
 
            predictions.append({
                "id":           pred_id,
                "classId":      pred_class_id,
                "className":    CLASS_BY_ID[pred_class_id]["name"],
                "confidence":   conf,
                "bbox":         bbox_to_dict(pred_box),
                "matched":      matched,
                "iou":          iou_val,
                "errorType":    error_type,
                "groundTruthId": gt_id,
            })
 
            # GT records its own failure mode for easy filtering on the frontend
            gt_error: str | None
            if matched:
                gt_error = None
            elif error_type == "localization":
                gt_error = "localization"
            elif error_type == "classification":
                gt_error = "classification"
            else:
                gt_error = "false_negative"
 
            ground_truths.append({
                "id":                   gt_id,
                "classId":              cls["id"],
                "className":            cls["name"],
                "bbox":                 bbox_to_dict(gt_box),
                "matched":              matched,
                "matchedPredictionId":  pred_id if matched else None,
                # Diagnostic: link the GT to the closest (unmatched) prediction
                "nearestPredictionId":  None if matched else pred_id,
                "nearestPredictionIou": None if matched else iou_val,
                "errorType":            gt_error,
            })
 
    # ── Spurious false positives (no associated GT) ──────────────────────────
    n_fp = random.choices([0, 1, 2], weights=[60, 30, 10])[0]
    for _ in range(n_fp):
        fp_cls = random.choice(CLASSES)
        fp_box = random_bbox(small=fp_cls["small"])
        predictions.append({
            "id":            str(uuid.uuid4()),
            "classId":       fp_cls["id"],
            "className":     fp_cls["name"],
            "confidence":    round(random.uniform(0.25, 0.55), 4),
            "bbox":          bbox_to_dict(fp_box),
            "matched":       False,
            "iou":           0.0,
            "errorType":     "false_positive",
            "groundTruthId": None,
        })
 
    # ── Per-image score (Dice / F1) ───────────────────────────────────────────
    tp  = sum(1 for p in predictions if p["matched"])
    fp  = sum(1 for p in predictions if not p["matched"])
    fn  = sum(1 for g in ground_truths if not g["matched"])
    denom = 2 * tp + fp + fn
    score = round(2 * tp / denom, 4) if denom else 0.0
 
    # ── Dominant error type ───────────────────────────────────────────────────
    err_counts: dict[str, int] = defaultdict(int)
    for p in predictions:
        if p["errorType"]:
            err_counts[p["errorType"]] += 1
    for g in ground_truths:
        if g.get("errorType"):
            err_counts[g["errorType"]] += 1
    dominant = max(err_counts, key=err_counts.get) if err_counts else None
 
    # ── Tags ──────────────────────────────────────────────────────────────────
    tags: list[str] = []
    if any(c["small"] for c in present_cls):
        tags.append("small_objects")
    if len(ground_truths) >= 6:
        tags.append("crowded")
 
    return {
        "id":               img_id,
        "runId":            run_id,
        "filename":         filename,
        "imageUrl":         image_url,
        "width":            w_px,
        "height":           h_px,
        "score":            score,
        "truePositives":    tp,
        "falsePositives":   fp,
        "falseNegatives":   fn,
        "dominantErrorType": dominant,
        "classesPresent":   sorted({c["name"] for c in present_cls}),
        "tags":             tags,
        # Predictions sorted by confidence descending (matches NMS output order)
        "predictions":  sorted(predictions,   key=lambda p: -p["confidence"]),
        "groundTruths": ground_truths,
    }

def compute_run_metrics(
    images: list[dict],
) -> tuple[dict, list[dict], list[list[int]]]:
    """
    Derive per-class metrics and confusion matrix from generated images.
 
    Per-class TP/FP/FN are counted from the prediction and GT arrays.
    mAP50 is approximated via the harmonic-mean of P and R (F-score form
    of AP); mAP50-95 is scaled down by an empirical factor matching typical
    YOLO model behaviour (~0.63× mAP50).
    """
    class_tp:      dict[int, int] = defaultdict(int)
    class_fp:      dict[int, int] = defaultdict(int)
    class_fn:      dict[int, int] = defaultdict(int)
    class_support: dict[int, int] = defaultdict(int)
 
    # confusion[true_cls][pred_cls] → count
    confusion = [[0] * N_CLASSES for _ in range(N_CLASSES)]
 
    for img in images:
        for g in img["groundTruths"]:
            cid = g["classId"]
            class_support[cid] += 1
            if g["matched"]:
                class_tp[cid] += 1
                confusion[cid][cid] += 1   # TP on the diagonal
            else:
                class_fn[cid] += 1
 
        for p in img["predictions"]:
            if p["errorType"] == "classification" and p.get("groundTruthId"):
                # Classification error: find the GT to log the off-diagonal cell
                gt = next(
                    (g for g in img["groundTruths"] if g["id"] == p["groundTruthId"]),
                    None,
                )
                if gt and gt["classId"] != p["classId"]:
                    confusion[gt["classId"]][p["classId"]] += 1
                class_fp[p["classId"]] += 1
 
            elif not p["matched"] and p["errorType"] in ("false_positive", "localization"):
                class_fp[p["classId"]] += 1
 
    per_class: list[dict] = []
    for cls in CLASSES:
        cid = cls["id"]
        tp  = class_tp[cid]
        fp  = class_fp[cid]
        fn  = class_fn[cid]
        sup = class_support[cid]
 
        prec = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
        rec  = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
        f1   = round(2 * prec * rec / (prec + rec), 4) if (prec + rec) > 0 else 0.0
 
        # mAP50 approximation: harmonic mean of P and R (a decent single-threshold AP proxy)
        map50    = round(2 * prec * rec / (prec + rec), 4) if (prec + rec) > 0 else 0.0
        map50_95 = round(map50 * random.uniform(0.58, 0.68), 4)
 
        per_class.append({
            "classId":       cid,
            "className":     cls["name"],
            "map50":         map50,
            "map50_95":      map50_95,
            "precision":     prec,
            "recall":        rec,
            "f1":            f1,
            "support":       sup,
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
        })
 
    # Macro average over classes that actually appear in the dataset
    active = [m for m in per_class if m["support"] > 0]
    agg = {
        "map50":     round(sum(m["map50"]     for m in active) / len(active), 4) if active else 0.0,
        "map50_95":  round(sum(m["map50_95"]  for m in active) / len(active), 4) if active else 0.0,
        "precision": round(sum(m["precision"] for m in active) / len(active), 4) if active else 0.0,
        "recall":    round(sum(m["recall"]    for m in active) / len(active), 4) if active else 0.0,
        "f1":        round(sum(m["f1"]        for m in active) / len(active), 4) if active else 0.0,
    }
 
    return agg, per_class, confusion

def main() -> None:
    out_dir = Path("data/")
    out_dir.mkdir(parents=True, exist_ok=True)
 
    run_id = "run-" + str(uuid.uuid4())[:8]
    print(f"Generating {N_IMAGES} images for run {run_id} …")
 
    images = [generate_image(run_id, i) for i in range(N_IMAGES)]
 
    agg, per_class, confusion = compute_run_metrics(images)
 
    run: dict[str, Any] = {
        "id":               run_id,
        "modelId":          "model-yolo26n-coco-finetune",
        "modelName":        "yolo26n (fine-tuned)",
        "datasetName":      "coco8-custom-val",
        "split":            "val",
        "createdAt":        datetime.now(timezone.utc).isoformat(),
        "status":           "complete",
        "imageCount":       N_IMAGES,
        "classNames":       [c["name"] for c in CLASSES],
        "aggregateMetrics": agg,
        "perClassMetrics":  per_class,
        "confusionMatrix":  confusion,
    }
 
    # ── Write fixtures ─────────────────────────────────────────────────────────
 
    # 1. Full run summary
    (out_dir / "run_001.json").write_text(json.dumps(run, indent=2))
 
    # 2. Full image results (includes predictions + groundTruths)
    (out_dir / "images.json").write_text(json.dumps(images, indent=2))
 
    # 3. Lightweight index — strip prediction/GT arrays for list views
    index_keys = [
        "id", "runId", "filename", "imageUrl", "width", "height",
        "score", "truePositives", "falsePositives", "falseNegatives",
        "dominantErrorType", "classesPresent", "tags",
    ]
    images_index = [{k: img[k] for k in index_keys} for img in images]
    (out_dir / "images_index.json").write_text(json.dumps(images_index, indent=2))
 
    # ── Summary printout ───────────────────────────────────────────────────────
    print()
    print("Output files:")
    print(f"  ✓ {out_dir}/run_001.json")
    print(f"  ✓ {out_dir}/images.json         ({len(images)} images, full detail)")
    print(f"  ✓ {out_dir}/images_index.json   ({len(images)} images, list view)")
    print()
    print("Aggregate metrics:")
    print(f"  mAP50     {agg['map50']:.3f}")
    print(f"  mAP50-95  {agg['map50_95']:.3f}")
    print(f"  Precision {agg['precision']:.3f}")
    print(f"  Recall    {agg['recall']:.3f}")
    print(f"  F1        {agg['f1']:.3f}")
    print()
    print("Per-class mAP50 (sorted ascending — worst first):")
    for m in sorted(per_class, key=lambda x: x["map50"]):
        bar = "█" * int(m["map50"] * 20)
        support_label = f"n={m['support']}"
        print(f"  {m['className']:>14s}  {m['map50']:.3f}  {bar:<14s}  {support_label}")

if __name__ == "__main__":
    main()