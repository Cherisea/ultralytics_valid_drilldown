"""
scripts/generate_mock_data.py
 
Mock data generator for the Ultralytics Platform validation prototype.
 
Uses real COCO128 images and ground truth annotations. Synthetic predictions
are then generated on top of the real GT boxes using per-class difficulty
profiles, so the detail view shows real images with plausible (if simulated)
model outputs.
 
─── What the real production pipeline looks like ──────────────────────────────
 
    Layer 1 — Aggregate metrics       → model.val()  → results.box.map50 etc.
    Layer 2 — Per-image summary       → model.val()  → results.box.image_metrics
    Layer 3 — Per-box detail          → model.predict() + label loading + IoU
                                        matching (what this script simulates)

─── Steps to production ────────────────────────────────────────────────────────

    1, Get GT boxes from wherever annotations are stored, a MongoDB collection, 
        a cloud service storage bucket or directly from YOLO dataset YAML;
    2, Replace simulated predictions with real model output;
    3, Replace JSON file writes with MongoDB writes;

─── Outputs ───────────────────────────────────────────────────────────────────
 
    data/run_001.json
    data/images.json
    data/images_index.json
    public/images/*.jpg              ← real COCO128 images served by Next.js
"""

import json
import random
import uuid
import yaml
from PIL import Image
import shutil

from ultralytics.utils.downloads import download
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Reproducibility ────────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
 
# ── Config ─────────────────────────────────────────────────────────────────────
MAX_IMAGES = 60      # cap for a manageable prototype dataset
IOU_THRESHOLD = 0.50  # COCO standard: IoU ≥ 0.5 → true positive
COCO_CLASS_IDS = {0, 1, 2, 3, 5, 7, 9, 11, 16, 17, 14}
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Map from COCO ID → our internal class definition
# base_recall     – P(model detects this GT instance at all)
# base_precision  – P(detected instance is correctly classified AND well-localised)
# confuses_with   – class IDs the model frequently predicts instead (wrong class)
CLASSES: list[dict] = [
    {"id": 0,  "cocoId": 0,  "name": "person",        "base_recall": 0.79, "base_precision": 0.82, "confuses_with": [],      "small": False},
    {"id": 1,  "cocoId": 1,  "name": "bicycle",       "base_recall": 0.68, "base_precision": 0.71, "confuses_with": [3],     "small": False},
    {"id": 2,  "cocoId": 2,  "name": "car",           "base_recall": 0.83, "base_precision": 0.85, "confuses_with": [4, 5],  "small": False},
    {"id": 3,  "cocoId": 3,  "name": "motorcycle",    "base_recall": 0.70, "base_precision": 0.74, "confuses_with": [1],     "small": False},
    {"id": 4,  "cocoId": 5,  "name": "bus",           "base_recall": 0.76, "base_precision": 0.79, "confuses_with": [2],     "small": False},
    {"id": 5,  "cocoId": 7,  "name": "truck",         "base_recall": 0.72, "base_precision": 0.77, "confuses_with": [2],     "small": False},
    {"id": 6,  "cocoId": 9,  "name": "traffic light", "base_recall": 0.55, "base_precision": 0.62, "confuses_with": [],      "small": True},
    {"id": 7,  "cocoId": 11, "name": "stop sign",     "base_recall": 0.61, "base_precision": 0.68, "confuses_with": [],      "small": False},
    {"id": 8,  "cocoId": 16, "name": "dog",           "base_recall": 0.76, "base_precision": 0.80, "confuses_with": [9],     "small": False},
    {"id": 9,  "cocoId": 17, "name": "cat",           "base_recall": 0.73, "base_precision": 0.78, "confuses_with": [8],     "small": False},
    {"id": 10, "cocoId": 14, "name": "bird",          "base_recall": 0.39, "base_precision": 0.48, "confuses_with": [],      "small": True},
]
N_CLASSES = len(CLASSES)
CLASS_BY_ID       = {c["id"]: c for c in CLASSES}
CLASS_BY_COCO_ID  = {c["cocoId"]: c for c in CLASSES}

def random_bbox_near(cx: float, cy: float) -> list[float]:
    """Random box with no GT — spurious false positive near a given location."""
    w = random.uniform(0.04, 0.20)
    h = random.uniform(0.04, 0.20)
    cx = max(w / 2, min(1 - w / 2, cx + random.uniform(-0.15, 0.15)))
    cy = max(h / 2, min(1 - h / 2, cy + random.uniform(-0.15, 0.15)))
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

# ── COCO128 loading ────────────────────────────────────────────────────────────

def download_coco128() -> Path:
    """
    Download COCO128 via Ultralytics and return the dataset root path.
    COCO128 is ~6MB and contains 128 real images from COCO train 2017.
    """
    datasets_root = PROJECT_ROOT / "dataset"
    coco128_yaml  = datasets_root / "coco128" / "coco128.yaml"
 
    if not coco128_yaml.exists():
        print("  Downloading COCO128 (~6MB) …")
        download(
            "https://ultralytics.com/assets/coco128.zip",
            dir=datasets_root,
            unzip=True,
        )
 
    return datasets_root / "coco128"

def load_coco128_images(dataset_root: Path) -> list[dict]:
    """
    Return a list of dicts, one per image that contains at least one of our
    target classes. Each dict has:
        path       absolute path to the .jpg
        width      image width in pixels
        height     image height in pixels
        gt_objects list of {coco_id, cx, cy, w, h}  (normalised)
    """
    img_dir   = dataset_root / "images" / "train2017" 
    label_dir = dataset_root / "labels" / "train2017"
 
    records = []
    for img_path in sorted(img_dir.glob("*.jpg")):
        label_path = label_dir / img_path.with_suffix(".txt").name
        if not label_path.exists():
            continue
 
        # Parse YOLO label file: each line = "class_id cx cy w h"
        gt_objects = []
        for line in label_path.read_text().strip().splitlines():
            parts = line.split()
            if len(parts) != 5:
                continue
            coco_id = int(parts[0])
            if coco_id not in COCO_CLASS_IDS:
                continue
            gt_objects.append({
                "coco_id": coco_id,
                "cx": float(parts[1]),
                "cy": float(parts[2]),
                "w":  float(parts[3]),
                "h":  float(parts[4]),
            })
 
        if not gt_objects:
            continue  # image has none of our 11 classes
 
        with Image.open(img_path) as im:
            width, height = im.size
 
        records.append({
            "path":       img_path,
            "width":      width,
            "height":     height,
            "gt_objects": gt_objects,
        })
 
    return records

def generate_image(run_id: str, idx: int, record: dict, public_img_dir: Path) -> dict[str, Any]:
    """
        Build a full ImageResult for one real COCO128 image.
    
        Real GT boxes are read from the label file. Synthetic predictions are
        generated on top of them using per-class difficulty profiles
        ──────────────────────────────
        1. Roll ≤ base_recall? → MISSED (false negative)
        2. Roll → one of:
        a. True positive       jitter_bbox, same class, IoU ≥ 0.5, high conf
        b. Localisation error  displace_bbox, same class, IoU < 0.5, med conf
        c. Classification err  jitter_bbox, wrong class, IoU ≥ 0.5, med conf
        3. Sprinkle spurious false positives (unrelated to any GT)
    """
    img_path: Path = record["path"]
    filename = f"val_{idx:04d}.jpg"
    dest = public_img_dir / filename
 
    # Copy the real image into Next.js public directory
    if not dest.exists():
        shutil.copy2(img_path, dest)
 
    img_id    = str(uuid.uuid4())
    image_url = f"/images/{filename}"   # served by Next.js as a static asset
 
    ground_truths: list[dict] = []
    predictions:   list[dict] = []
 
    for gt_obj in record["gt_objects"]:
        cls = CLASS_BY_COCO_ID[gt_obj["coco_id"]]
        gt_box = [gt_obj["cx"], gt_obj["cy"], gt_obj["w"], gt_obj["h"]]
        gt_id  = str(uuid.uuid4())
 
        # ── Step 1: missed entirely? ─────────────────────────────────────────
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
 
        # ── Step 2: what kind of detection? ─────────────────────────────────
        loc_prob     = 0.08
        cls_err_prob = 0.05 if cls["confuses_with"] else 0.0
        tp_prob      = max(0.0, cls["base_precision"] - loc_prob - cls_err_prob)
 
        r = random.random()
 
        if r < tp_prob:
            pred_box      = jitter_bbox(gt_box)
            pred_class_id = cls["id"]
            iou_val       = compute_iou(gt_box, pred_box)
            conf          = round(random.uniform(0.60, 0.95), 4)
            error_type    = None
 
        elif r < tp_prob + loc_prob:
            pred_box      = displace_bbox(gt_box)
            pred_class_id = cls["id"]
            iou_val       = compute_iou(gt_box, pred_box)
            conf          = round(random.uniform(0.35, 0.65), 4)
            error_type    = "localization"
 
        elif r < tp_prob + loc_prob + cls_err_prob:
            pred_box      = jitter_bbox(gt_box)
            pred_class_id = random.choice(cls["confuses_with"])
            iou_val       = compute_iou(gt_box, pred_box)
            conf          = round(random.uniform(0.40, 0.70), 4)
            error_type    = "classification"
 
        else:
            pred_box      = jitter_bbox(gt_box)
            pred_class_id = cls["id"]
            iou_val       = compute_iou(gt_box, pred_box)
            conf          = round(random.uniform(0.60, 0.95), 4)
            error_type    = None
 
        matched    = (iou_val >= IOU_THRESHOLD) and (error_type != "classification")
        pred_id    = str(uuid.uuid4())
        pred_class = CLASS_BY_ID[pred_class_id]
 
        predictions.append({
            "id":            pred_id,
            "classId":       pred_class_id,
            "className":     pred_class["name"],
            "confidence":    conf,
            "bbox":          bbox_to_dict(pred_box),
            "matched":       matched,
            "iou":           iou_val,
            "errorType":     error_type,
            "groundTruthId": gt_id,
        })
 
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
            "nearestPredictionId":  None if matched else pred_id,
            "nearestPredictionIou": None if matched else iou_val,
            "errorType":            gt_error,
        })
 
    # ── Spurious false positives ──────────────────────────────────────────────
    n_fp = random.choices([0, 1, 2], weights=[60, 30, 10])[0]
    for _ in range(n_fp):
        fp_cls = random.choice(CLASSES)
        # Place near a random existing GT if possible, otherwise centre of image
        anchor = random.choice(record["gt_objects"]) if record["gt_objects"] else {"cx": 0.5, "cy": 0.5}
        fp_box = random_bbox_near(anchor["cx"], anchor["cy"])
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
 
    # ── Per-image score ───────────────────────────────────────────────────────
    tp    = sum(1 for p in predictions if p["matched"])
    fp    = sum(1 for p in predictions if not p["matched"])
    fn    = sum(1 for g in ground_truths if not g["matched"])
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
    gt_classes = [CLASS_BY_COCO_ID[o["coco_id"]] for o in record["gt_objects"]]
    if any(c["small"] for c in gt_classes):
        tags.append("small_objects")
    if len(ground_truths) >= 6:
        tags.append("crowded")
 
    return {
        "id":               img_id,
        "runId":            run_id,
        "filename":         filename,
        "imageUrl":         image_url,
        "width":            record["width"],
        "height":           record["height"],
        "score":            score,
        "truePositives":    tp,
        "falsePositives":   fp,
        "falseNegatives":   fn,
        "dominantErrorType": dominant,
        "classesPresent":   sorted({CLASS_BY_COCO_ID[o["coco_id"]]["name"] for o in record["gt_objects"]}),
        "tags":             tags,
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
    public_img_dir = Path("public/images")
    out_dir.mkdir(parents=True, exist_ok=True)
    public_img_dir.mkdir(parents=True, exist_ok=True)
 
    run_id = "run-coco8-001"
 
    # ── Load real COCO128 images and annotations ──────────────────────────────
    print("Loading COCO128 dataset …")
    dataset_root = download_coco128()
    records      = load_coco128_images(dataset_root)
 
    if not records:
        raise RuntimeError(
            "No COCO128 images found with target classes. "
            f"Check that {PROJECT_ROOT}/dataset/coco128/ was downloaded correctly."
    )

    # Shuffle with fixed seed then cap at MAX_IMAGES
    random.shuffle(records)
    records = records[:MAX_IMAGES]
 
    print(f"Found {len(records)} images with target classes (capped at {MAX_IMAGES})")
    print(f"Generating fixtures for run {run_id} …")
 
    images = [
        generate_image(run_id, i, rec, public_img_dir)
        for i, rec in enumerate(records)
    ]
 
    agg, per_class, confusion = compute_run_metrics(images)
 
    run: dict[str, Any] = {
        "id":               run_id,
        "modelId":          "model-yolo26n-coco-finetune",
        "modelName":        "yolo26n (fine-tuned)",
        "datasetName":      "coco128",
        "split":            "val",
        "createdAt":        datetime.now(timezone.utc).isoformat(),
        "status":           "complete",
        "imageCount":       len(images),
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