import torch
import torchvision.models as models
import torch.nn as nn
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
        return cls._instance

    def load_model(self):
        if self.model is not None:
            return

        logger.info(f"Loading MobileNetV2 on device: {self.device}...")
        try:
            # Load MobileNetV2 with pretrained weights
            weights = models.MobileNet_V2_Weights.DEFAULT
            self.model = models.mobilenet_v2(weights=weights)
            self.model.to(self.device)
            self.model.eval()

            # Load classification labels (from the weights' meta)
            self.labels = weights.meta["categories"]
            logger.info("MobileNetV2 loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise e

    def get_inference_outputs(self, tensor_img: torch.Tensor):
        """
        Run forward pass on the tensor image [1, 3, 224, 224].
        Returns:
            - features: 1280-dim numpy array
            - class_probs: list of (class_name, probability) sorted by probability descending
        """
        if self.model is None:
            self.load_model()

        with torch.no_grad():
            x = tensor_img.to(self.device)
            
            # Extract features (before classifier)
            features_map = self.model.features(x)
            # Global Average Pooling (similar to TF.js MobileNetV2 .infer(img, true))
            features = nn.functional.adaptive_avg_pool2d(features_map, (1, 1))
            features = torch.flatten(features, 1)  # shape: [1, 1280]
            features_np = features.cpu().numpy()[0]

            # Pass features to classifier to get 1000 class logits
            logits = self.model.classifier(features)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]

            # Pair with labels
            class_probs = []
            for idx, prob in enumerate(probs):
                class_probs.append((self.labels[idx], float(prob)))
            class_probs.sort(key=lambda item: item[1], reverse=True)

            return features_np, class_probs
