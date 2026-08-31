import os
import torch
import torchvision.models as models
import torch.nn as nn
from pathlib import Path
from PIL import Image
import logging

logger = logging.getLogger("ml-server")

class ModelLoader:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelLoader, cls).__new__(cls)
            cls._instance.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            cls._instance.model = None
            cls._instance.labels = None
            cls._instance.yolo_model = None
            cls._instance.yolo_names = {
                0: "goat_face",
                1: "eye",
                2: "mouth",
                3: "ear",
                4: "goat_body",
                5: "eye_discharge",
                6: "nasal_discharge",
                7: "skin_lesion",
                8: "abnormal_posture",
                9: "possible_lameness"
            }
        return cls._instance

    def load_model(self):
        # 1. Try to load YOLOv8 model first
        self.load_yolo_model()

        # 2. Load MobileNetV2 as feature extractor & fallback classifier
        if self.model is not None:
            return

        logger.info(f"Loading MobileNetV2 on device: {self.device}...")
        try:
            weights = models.MobileNet_V2_Weights.DEFAULT
            self.model = models.mobilenet_v2(weights=weights)
            self.model.to(self.device)
            self.model.eval()
            self.labels = weights.meta["categories"]
            logger.info("MobileNetV2 loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load MobileNetV2: {e}")
            raise e

    def load_yolo_model(self):
        """Attempts to load trained YOLO weights (4skwhnrscr or health scaffold)."""
        if self.yolo_model is not None:
            return

        candidate_paths = [
            Path(__file__).resolve().parent.parent / "models" / "best.pt",
            Path(__file__).resolve().parent.parent / "models" / "best.onnx",
            Path(__file__).resolve().parent.parent.parent / "datasets" / "4skwhnrscr" / "weights" / "best.pt",
            Path(__file__).resolve().parent.parent.parent / "datasets" / "4skwhnrscr" / "runs" / "4skwhnrscr_goat_train" / "weights" / "best.pt",
            Path(__file__).resolve().parent.parent.parent / "alpasfarm_yolo_goat_health_1000_scaffold" / "weights" / "best.pt",
            Path("models/best.pt"),
            Path("best.pt"),
        ]

        for p in candidate_paths:
            if p.exists():
                try:
                    logger.info(f"Loading YOLO model from: {p}...")
                    from ultralytics import YOLO
                    self.yolo_model = YOLO(str(p))
                    if hasattr(self.yolo_model, "names") and self.yolo_model.names:
                        self.yolo_names = self.yolo_model.names
                    logger.info(f"✅ YOLO model loaded successfully from {p}")
                    return
                except Exception as err:
                    logger.warning(f"Could not load YOLO from {p}: {err}")

        logger.info("No custom YOLO weights found yet; will use MobileNetV2 feature engine.")

    def get_yolo_detections(self, pil_img: Image.Image, conf_threshold: float = 0.25):
        """
        Runs YOLO object detection on PIL Image.
        Returns list of detections with normalized bounding boxes [x1, y1, x2, y2].
        """
        if self.yolo_model is None:
            self.load_yolo_model()

        if self.yolo_model is None:
            return None

        try:
            results = self.yolo_model.predict(pil_img, conf=conf_threshold, verbose=False)
            detections = []
            img_w, img_h = pil_img.size

            for r in results:
                if r.boxes is None:
                    continue
                for box in r.boxes:
                    cls_id = int(box.cls[0].item())
                    cls_name = self.yolo_names.get(cls_id, f"class_{cls_id}")
                    conf = float(box.conf[0].item())
                    xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2] absolute
                    
                    # Normalize to 0..1
                    norm_box = [
                        round(xyxy[0] / img_w, 4),
                        round(xyxy[1] / img_h, 4),
                        round(xyxy[2] / img_w, 4),
                        round(xyxy[3] / img_h, 4)
                    ]

                    detections.append({
                        "class_id": cls_id,
                        "class_name": cls_name,
                        "confidence": conf,
                        "box": norm_box
                    })

            return detections
        except Exception as e:
            logger.error(f"YOLO inference error: {e}")
            return None

    def get_inference_outputs(self, tensor_img: torch.Tensor):
        if self.model is None:
            self.load_model()

        with torch.no_grad():
            x = tensor_img.to(self.device)
            features_map = self.model.features(x)
            features = nn.functional.adaptive_avg_pool2d(features_map, (1, 1))
            features = torch.flatten(features, 1)
            features_np = features.cpu().numpy()[0]

            logits = self.model.classifier(features)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

            class_probs = []
            for idx, prob in enumerate(probs):
                class_probs.append((self.labels[idx], float(prob)))
            class_probs.sort(key=lambda item: item[1], reverse=True)

            return features_np, class_probs

