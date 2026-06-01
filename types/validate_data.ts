/**
 * Full data model for the Ultralytics Platform validation prototype.
 * All bounding boxes use normalised YOLO format: [cx, cy, w, h] where values
 * are in [0, 1] relative to the image dimensions.
 *
 * This file is the single source of truth for the frontend ↔ API contract.
 * The Python Pydantic models in backend/models.py mirror these types exactly.
 */
 