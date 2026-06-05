"""
This script is a REFERENCE file that may be implemented later when building a real backend!

Pydantic v2 models for the validation prototype API. It Mirrors types/validation.ts exactly — 
field names use camelCase throughout so that JSON serialisation requires no translation layer.

In the mock phase these models validate the static JSON fixtures. In production they would validate 
MongoDB documents populated by the Ultralytics Python package's model.val() output; the API contract 
is identical either way.

Production path:
    from ultralytics import YOLO

    model = YOLO("best.pt")
    results = model.val(data="dataset.yaml")
    # → results.maps, results.box.p, results.box.r, results.confusion_matrix
    # → convert to these models → store in MongoDB → served by these endpoints
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ErrorType(str, Enum):
    false_positive = "false_positive"
    false_negative = "false_negative"
    localization   = "localization"
    classification = "classification"
    duplicate      = "duplicate"


class RunStatus(str, Enum):
    complete = "complete"
    running  = "running"
    failed   = "failed"


class DataSplit(str, Enum):
    val  = "val"
    test = "test"


class PatternGroupBy(str, Enum):
    cls        = "class"
    error_type = "errorType"
    confidence = "confidence"


class SortOrder(str, Enum):
    worst       = "worst"
    best        = "best"
    most_errors = "most_errors"


# ---------------------------------------------------------------------------
# Shared geometry
# ---------------------------------------------------------------------------

class BBox(BaseModel):
    """Normalised bounding box in YOLO [cx, cy, w, h] format."""
    x: float = Field(..., ge=0.0, le=1.0, description="Centre-x, normalised")
    y: float = Field(..., ge=0.0, le=1.0, description="Centre-y, normalised")
    w: float = Field(..., ge=0.0, le=1.0, description="Width, normalised")
    h: float = Field(..., ge=0.0, le=1.0, description="Height, normalised")


# ---------------------------------------------------------------------------
# Detection (model prediction)
# ---------------------------------------------------------------------------

class Detection(BaseModel):
    id: str
    classId: int
    className: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: BBox
    matched: bool
    iou: float = Field(..., ge=0.0, le=1.0)
    errorType: Optional[ErrorType] = None
    groundTruthId: Optional[str] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Ground truth annotation
# ---------------------------------------------------------------------------

class GroundTruth(BaseModel):
    id: str
    classId: int
    className: str
    bbox: BBox
    matched: bool
    matchedPredictionId: Optional[str] = None
    nearestPredictionId: Optional[str] = None
    nearestPredictionIou: Optional[float] = Field(None, ge=0.0, le=1.0)
    errorType: Optional[ErrorType] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Image-level result
# ---------------------------------------------------------------------------

class ImageResult(BaseModel):
    """Full per-image validation result including all predictions and GTs."""
    id: str
    runId: str
    filename: str
    imageUrl: str
    width: int
    height: int

    score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Dice coefficient / F1: 2TP / (2TP + FP + FN)",
    )

    truePositives: int
    falsePositives: int
    falseNegatives: int
    dominantErrorType: Optional[ErrorType] = None

    classesPresent: list[str]
    tags: list[str]

    predictions: list[Detection]
    groundTruths: list[GroundTruth]


class ImageListItem(BaseModel):
    """Lightweight image summary — no predictions/groundTruths arrays."""
    id: str
    runId: str
    filename: str
    imageUrl: str
    width: int
    height: int
    score: float
    truePositives: int
    falsePositives: int
    falseNegatives: int
    dominantErrorType: Optional[ErrorType] = None
    classesPresent: list[str]
    tags: list[str]


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

class AggregateMetrics(BaseModel):
    map50: float
    map50_95: float
    precision: float
    recall: float
    f1: float


class ClassMetrics(BaseModel):
    classId: int
    className: str
    map50: float
    map50_95: float
    precision: float
    recall: float
    f1: float
    support: int           # GT instance count in the dataset
    truePositives: int
    falsePositives: int
    falseNegatives: int


# ---------------------------------------------------------------------------
# Validation run
# ---------------------------------------------------------------------------

class ValidationRun(BaseModel):
    id: str
    modelId: str
    modelName: str
    datasetName: str
    split: DataSplit
    createdAt: str         # ISO 8601
    status: RunStatus
    imageCount: int
    classNames: list[str]  # index == classId
    aggregateMetrics: AggregateMetrics
    perClassMetrics: list[ClassMetrics]
    confusionMatrix: list[list[int]]  # [trueClassId][predictedClassId] → count


# ---------------------------------------------------------------------------
# API response envelopes
# ---------------------------------------------------------------------------

class RunSummaryResponse(BaseModel):
    run: ValidationRun


class ImageListResponse(BaseModel):
    items: list[ImageListItem]
    total: int
    page: int
    pageSize: int


class ImageDetailResponse(BaseModel):
    image: ImageResult


class PatternGroup(BaseModel):
    label: str
    count: int
    avgScore: float
    errorBreakdown: dict[str, int]
    representativeImageIds: list[str]


class PatternsResponse(BaseModel):
    groupBy: str
    groups: list[PatternGroup]
