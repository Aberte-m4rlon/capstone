# AlpasFarm Detector Stability Report

Date: 2026-09-20

## Audit findings

The live camera overlay uses `public/models/goat_yolov8n.onnx` for goat detection and pretrained COCO MediaPipe for sheep/person detection. The shutter health result uses remote Gemini Vision. `ml-server` is not called by the frontend and has no checked-in trained weights. All repository YOLO, pose, scaffold, and Darknet class lists are goat-only; there is no trained AlpasFarm sheep class. Full routing and class evidence are in `DETECTOR_AUDIT.md`.

## Changes

- Ambiguous MediaPipe crop verification now returns `UNCERTAIN` instead of defaulting to goat.
- Local species labels are withheld until three recent samples exist for the tracked candidate. Existing box EMA smoothing, grace periods, quality gates, and stored health-screening fields remain unchanged.
- No model version was bumped because this change affects only the live overlay gate and does not reinterpret stored health-screening records.

## Validation and metrics

Before/after per-species precision, recall, and detector mAP@0.5 are **not available**. The checkout has no labeled sheep images, no ground-truth detector annotations for the active ONNX/MediaPipe combination, and no measured held-out evaluation set. No metric is being invented.

Measured checks from this environment:

- `npm run build`: passed. TypeScript compilation and Vite production bundling completed successfully.
- `python train_4skwhnrscr_yolo.py --epochs 1 --batch 1 --device cpu`: blocked before training because Python is not installed/discoverable.
- `python convert_darknet_yolov4.py`: blocked by the same missing Python runtime.
- `python ALPASFARM-Goat-Pose/validate_dataset.py`: blocked by the same missing Python runtime.
- `test_fixtures/` contains eight unlabeled images and no sheep image; it supports only manual smoke coverage, not precision/recall/mAP.
- `npm.cmd run dev -- --host 127.0.0.1` from the repository directory: passed; Vite reported `http://127.0.0.1:5173/`. The temporary server was stopped after verification.

## Known limitations

The checked-in goat ONNX asset is not a goat/sheep model. MediaPipe's sheep class is generic COCO and has not been measured on farm conditions. Gemini species and health responses are remote and unmeasured here. Brightness/box-size checks exist for the live overlay, but a full blur/resolution quality gate is not present in that path. Accurate sheep support still requires real labeled sheep images merged with compatible goat data, balanced splits, and targeted goat/sheep confusion evaluation.

## Next steps

1. Add farm-owned goat and sheep images with bounding-box labels across lighting, distance, angle, and occlusion; keep train/validation/test identities separate.
2. Train one detector with explicit `goat` and `sheep` classes, then choose confidence and NMS/IoU settings on validation data only.
3. Report precision, recall, mAP@0.5, and goat-to-sheep/sheep-to-goat confusion separately on the held-out test set.
4. Replace the generic/handcrafted species fusion with the evaluated two-class model, then run fixture and real-image smoke tests before deployment.
