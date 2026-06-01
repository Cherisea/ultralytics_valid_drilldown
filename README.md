# ultralytics_valid_drilldown
This prototype demonstrates the image-drilldown layer that sits underneath the existing validation dashboard, allowing a user to inspect individual images that weren't performing as well as we expect on certain metrics. This layer also empowers a user to discover potential patterns from failing cases, thus providing actionable insights into how to improve model performance on later iterations.

## Get started

## How to run this project

## Architecture Overview
- **Frontend**: Next.js + TypeScript;
- **Backend**: Python serverless endpoints
- **Database**: MongoDB

## Assumptions
- Per-image evaluation results;
- Predictions
- Image labels (ground truth)
- Confidence scores
- Error metadata

## API endpoints
```
GET /api/runs/:id/summary

Aggregate metrics, per-class tables and confusion matrix.
```

```
GET /api/images/:id
```
Full image-level detail: prediction, ground truth, confidence score and error tag.


## What's mocked and implemented

## Evolution to production