# AlpasFarm Detector Audit

Date: 2026-09-20

## Owner's likely target

The likely production issue is the live camera scanner. Its local path combines a checked-in goat-only ONNX model, a generic COCO/MediaPipe detector, and a handcrafted crop verifier; the shutter health result comes from remote Gemini Vision. The older `cameraML.ts` MobileNet/logistic-regression description is stale: its local model and training functions are compatibility no-ops.

## Live production routing

1. `/camera-screening` renders `LiveObjectDetectionCamera`.
2. Camera startup loads `public/models/goat_yolov8n.onnx` through ONNX Runtime Web and `public/models/efficientdet_lite0.tflite` through MediaPipe, with a remote CDN fallback.
3. `detectLiveFrameLocally()` uses ONNX for goat boxes. MediaPipe supplies COCO `sheep` and `person` candidates; sheep candidates pass through `verifyLivestockSpeciesFromCrop()`, whose fallback result is goat. `applyTemporalStabilityAndQuality()` keeps a four-sample/1200 ms history and EMA-smoothed boxes, but its thresholds are not measured on a held-out set.
4. Pressing scan calls `/api/gemini/animal-scan` through `scanAnimalWithGemini()` and requires server-side `GEMINI_API_KEY`. `/api/gemini/detect-objects` also exists, but the current camera overlay uses the local detector.
5. `cameraML.ts` wraps Gemini and preserves stored screening types. `myai_service/farm_tools.py` only reads stored screening records for AI context.
6. `ml-server/app/main.py` is not referenced by the frontend. It has no checked-in weights in `ml-server/models`, so it falls back to ImageNet MobileNetV2, which is not a goat/sheep detector. Its optional hardcoded ten-class map also disagrees with the repository YAMLs.

## Model and dataset class audit

| Pipeline/artifact | Actual classes | Sheep status | Runtime status |
|---|---|---|---|
| `public/models/goat_yolov8n.onnx` | Runtime assumes one class: `goat` | Absent | Live local goat detector |
| `public/models/efficientdet_lite0.tflite` | Pretrained COCO, including `person` and `sheep`; no goat | Real pretrained class, not AlpasFarm-trained | Live local generic detector |
| `datasets/4skwhnrscr/data.yaml` | `goat_face`, `eye`, `mouth`, `ear`, `goat_body` | Absent | Goat-only training source |
| `alpasfarm_yolo_goat_health_1000_scaffold/data.yaml` | `goat`, `eye_discharge`, `nasal_discharge`, `skin_lesion`, `abnormal_posture`, `possible_lameness` | Absent | Goat-only scaffold |
| `ALPASFARM-Goat-Pose/data.yaml` | One `goat` class plus 14 keypoints | Absent | Goat-only pose experiment |
| `ml-server/app/model_loader.py` | Ten hardcoded anatomical/health labels | Absent | Optional unused server loader |
| `convert_darknet_yolov4.py` | `goat_face`, `eye`, `mouth`, `ear` | Absent | Legacy inspector; weights absent |
| Gemini endpoints | Prompt/schema allows `goat`, `sheep`, `person`, `other` | Documented/requested, but unmeasured | Active on shutter/remote |

There is no trained AlpasFarm sheep class in this checkout. Sheep support is a generic pretrained COCO class or a remote Gemini response, not a locally trained goat/sheep detector.

That baseline has now been supplemented by `public/models/goat_sheep_yolov8n.onnx`, trained in Colab from `Sheep vs Goat.v16i.yolov8.zip`. It is a two-class species detector, separate from the older goat-only pipelines.

## Data and evaluation inventory

- `ALPASFARM-Goat-Pose/dataset_report.json` records 1,107 goat-only pose images: 884 train, 109 validation, 114 test. It reports annotations, not detector precision/recall/mAP.
- 4skwhnrscr documentation claims 2,991 goat images and 15,072 boxes, but its checked-in data has no trained weights and the trainer points at a separate `yolo_dataset` path.
- `test_fixtures/` contains eight unlabeled smoke images: car, cat, cow, dog, door, empty, goat/person, and person. There is no sheep fixture or ground truth, so these cannot produce species precision, recall, or mAP.
- The downloaded Roboflow dataset has 2,113 training images and 302 validation images. A grouped 15% holdout produced 1,786 train, 301 validation, and 326 test images in Colab.
- Held-out test metrics are now measured for the new model; confidence and NMS thresholds remain deployment defaults.
- The ML-server tests are API smoke tests; the pose inference test uses a pretrained checkpoint rather than a repository-trained checkpoint.

## Findings and implementation boundary

- The old `CAMERA_SCREENING_REPORT.md` documents a retired local health classifier and does not describe the current live hybrid/Gemini route.
- Smoothing exists and the new two-class model has an actual held-out test, but it has not yet been tested on farm-owned images or deployed long enough for temporal stability measurements.
- Per-class test metrics: goat precision 0.5315, recall 0.7220, mAP@0.5 0.6450; sheep precision 0.7946, recall 0.8831, mAP@0.5 0.8023. Overall mAP@0.5 is 0.7236.
- The model is a public supplementary-dataset model, not proof of production farm accuracy. Add farm-owned goat/sheep images and re-evaluate before claiming deployment quality.

## Guardrails

