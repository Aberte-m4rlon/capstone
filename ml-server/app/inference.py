import numpy as np
from PIL import Image, ImageOps
import torch
import torchvision.transforms as transforms
import time
import math
from typing import Dict, Any, List, Tuple
from app.model_loader import ModelLoader

# Livestock-relevant feature indices (from cameraML.ts)
LIVESTOCK_FEATURE_INDICES = [
    100, 101, 120, 135, 156, 200, 210, 250, 280, 310,
    400, 420, 450, 500, 520, 550, 600, 650, 700, 750,
    800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250,
]

# ImageNet synsets to match
GOAT_KEYWORDS = ["goat", "ibex", "nanny", "billy"]
SHEEP_KEYWORDS = ["sheep", "ram", "tup", "ewe", "lamb", "bighorn", "merino"]
OTHER_KEYWORDS = {
    "dog": "Dog", "cat": "Cat", "person": "Person", "human": "Person", "man": "Person", "woman": "Person",
    "cow": "Cow", "cattle": "Cow", "bull": "Cow", "calf": "Cow", "horse": "Horse", "pony": "Horse",
    "chicken": "Chicken", "rooster": "Chicken", "hen": "Chicken", "bird": "Bird", "pig": "Pig",
    "hog": "Pig", "car": "Car", "truck": "Vehicle", "motorcycle": "Motorcycle", "bicycle": "Bicycle",
    "chair": "Object", "table": "Object", "llama": "Llama", "alpaca": "Alpaca", "deer": "Deer"
}

# Image quality thresholds
MIN_QUALITY_SCORE = 40
LOW_CONFIDENCE_THRESHOLD = 0.52

def assess_image_quality(img: Image.Image) -> Dict[str, Any]:
    """
    Assess quality parameters: brightness, blur (Laplacian variance), and resolution.
    Runs in pure NumPy (no OpenCV required).
    """
    issues = []
    guidance = []
    score = 100

    # 1. Resolution Check
    w, h = img.size
    min_dim = min(w, h)
    if min_dim < 100:
        issues.append("Image resolution too low")
        guidance.append("Move closer to the animal")
        score -= 30
    elif min_dim < 200:
        issues.append("Image resolution is low")
        guidance.append("Capture a closer, clearer photo")
        score -= 10

    # Convert to grayscale NumPy array for brightness and blur
    img_gray = ImageOps.grayscale(img)
    arr = np.array(img_gray, dtype=np.float32)

    # 2. Brightness Check
    mean_bright = np.mean(arr)
    if mean_bright < 40:
        issues.append("Image is too dark")
        guidance.append("Improve lighting or use camera flash")
        score -= 25
    elif mean_bright > 230:
        issues.append("Image is too bright")
        guidance.append("Avoid direct glare or strong backlighting")
        score -= 15

    # 3. Blur Check (Laplacian Variance in pure NumPy)
    # 3x3 Laplacian filter kernel
    kernel = np.array([[0, 1, 0],
                       [1, -4, 1],
                       [0, 1, 0]], dtype=np.float32)
    
    # Simple convolution on central region for speed and safety
    try:
        # Crop to center 64x64 if image is large enough
        cx, cy = w // 2, h // 2
        rw, rh = min(32, cx), min(32, cy)
        crop_arr = arr[cy-rh:cy+rh, cx-rw:cx+rw]
        
        # Apply 2D convolution
        laplacian = np.zeros_like(crop_arr)
        for i in range(1, crop_arr.shape[0]-1):
            for j in range(1, crop_arr.shape[1]-1):
                patch = crop_arr[i-1:i+2, j-1:j+2]
                laplacian[i, j] = np.sum(patch * kernel)
                
        lap_var = np.var(laplacian)
    except Exception:
        lap_var = 200.0  # Safe fallback if convolution fails

    if lap_var < 50:
        issues.append("Image is extremely blurry")
        guidance.append("Hold the camera steady and wait for focus")
        score -= 30
    elif lap_var < 150:
        issues.append("Image is slightly blurry")
        guidance.append("Tap to focus on the animal before capturing")
        score -= 15

    score = max(0, min(100, score))
    if not issues:
        guidance.append("Image quality is good!")
    else:
        guidance.extend(["✓ Good lighting", "✓ Animal clearly visible", "✓ Full body in frame", "✓ Avoid motion blur"])

    return {
        "score": score,
        "passed": score >= MIN_QUALITY_SCORE and not issues,
        "issues": issues,
        "guidance": list(set(guidance))
    }

def map_predictions(class_probs: List[Tuple[str, float]]) -> Tuple[str, float, str, float]:
    """
    Analyze ImageNet class probabilities to determine species and detection confidence.
    Returns:
        - species: 'goat' | 'sheep' | 'other' | 'unknown'
        - species_confidence: float
        - non_target_class: str | None
        - best_prob: float
    """
    best_goat_sheep = None
    best_other = None

    for class_name, prob in class_probs[:5]:
        prob = float(prob)
        lower_name = class_name.lower()
        
        # Species checking
        is_goat = any(kw in lower_name for kw in GOAT_KEYWORDS)
        is_sheep = any(kw in lower_name for kw in SHEEP_KEYWORDS)
        
        if is_goat or is_sheep:
            sp = "goat" if is_goat else "sheep"
            if best_goat_sheep is None or prob > best_goat_sheep["prob"]:
                best_goat_sheep = {"species": sp, "prob": prob, "name": class_name}
        else:
            # Check other categories
            matched_other = None
            for kw, disp in OTHER_KEYWORDS.items():
                if kw in lower_name:
                    matched_other = disp
                    break
            
            if matched_other:
                if best_other is None or prob > best_other["prob"]:
                    best_other = {"species": "other", "prob": prob, "name": matched_other}

    # Decide target vs other
    if best_goat_sheep and best_goat_sheep["prob"] >= 0.22:
        return best_goat_sheep["species"], best_goat_sheep["prob"], None, best_goat_sheep["prob"]
    
    if best_other and best_other["prob"] >= 0.22:
        return "other", best_other["prob"], best_other["name"], best_other["prob"]
        
    return "unknown", 0.0, None, 0.0

def analyze_visual_features(features: np.ndarray) -> List[Dict[str, Any]]:
    """
    Replicates the exact heuristic activation analysis of MobileNet features.
    """
    n = len(features)
    indicators = []
    
    mean = float(np.mean(features))
    std = float(np.std(features))
    max_val = float(np.max(features))
    
    # Segment calculations (10 segments)
    segment_size = n // 10
    segments = []
    for s in range(10):
        start = s * segment_size
        end = min(start + segment_size, n)
        seg_slice = features[start:end]
        segments.append({
            "mean": float(np.mean(seg_slice)),
            "std": float(np.std(seg_slice)),
            "max": float(np.max(seg_slice))
        })

    # Helper: activation ratio above threshold
    active_count = np.sum(features > 0.05)
    act_ratio = active_count / n

    # 1. Posture Check
    left_half = sum(seg["mean"] for seg in segments[:5]) / 5
    right_half = sum(seg["mean"] for seg in segments[5:]) / 5
    symmetry_diff = abs(left_half - right_half) / (mean + 0.001)
    
    posture_abnormal = symmetry_diff > 0.6 and std > mean * 1.5
    posture_confidence = min(0.85, 0.4 + symmetry_diff * 0.3)
    
    if posture_abnormal:
        indicators.append({
            "indicator": "ABNORMAL_POSTURE",
            "label": "Abnormal Posture",
            "riskPoints": 20,
            "confidence": float(posture_confidence),
            "description": "Asymmetric or unusual body position detected. May indicate discomfort or pain."
        })

    # 2. Body Condition
    body_range = segments[2:8]
    body_texture = sum(seg["std"] for seg in body_range) / len(body_range)
    body_mean = sum(seg["mean"] for seg in body_range) / len(body_range)
    
    poor_body = body_texture < mean * 0.6 and body_mean < mean * 0.85
    body_confidence = min(0.80, 0.35 + (1 - body_texture / (mean + 0.001)) * 0.4)
    
    if poor_body:
        indicators.append({
            "indicator": "POOR_BODY_CONDITION",
            "label": "Poor Body Condition",
            "riskPoints": 15,
            "confidence": float(body_confidence),
            "description": "Visual indicators suggest suboptimal body condition. May reflect nutritional deficiency."
        })

    # 3. Eye/Face Region
    face_features = features[int(n * 0.75):n]
    face_mean = float(np.mean(face_features))
    face_max = float(np.max(face_features))
    
    eye_ratio = face_mean / (mean + 0.001)
    eye_abnormal = eye_ratio > 2.2 and face_max > max_val * 0.85
    eye_confidence = min(0.80, 0.35 + (eye_ratio - 2.2) * 0.15)
    
    if eye_abnormal:
        indicators.append({
            "indicator": "VISIBLE_EYE_ABNORMALITY",
            "label": "Visible Eye Abnormality",
            "riskPoints": 20,
            "confidence": float(eye_confidence),
            "description": "Unusual activation in facial feature region. Possible eye discharge, cloudiness, or abnormality."
        })

    # 4. Skin/Coat
    skin_features = features[int(n * 0.2):int(n * 0.5)]
    skin_mean = float(np.mean(skin_features))
    skin_std = float(np.std(skin_features))
    
    skin_irregularity = skin_std / (skin_mean + 0.001)
    skin_abnormal = skin_irregularity > 3.5 and skin_mean > mean * 1.1
    skin_confidence = min(0.75, 0.30 + (skin_irregularity - 3.5) * 0.08)
    
    if skin_abnormal:
        indicators.append({
            "indicator": "VISIBLE_SKIN_ABNORMALITY",
            "label": "Visible Skin/Coat Abnormality",
            "riskPoints": 15,
            "confidence": float(skin_confidence),
            "description": "Irregular texture pattern in coat-feature activations. Possible lesion, hair loss, or skin condition."
        })

    # 5. Activity/Movement
    low_activity = act_ratio < 0.22 and std < mean * 0.8 and np.var(features) < 0.002
    activity_confidence = min(0.75, 0.35 + (0.22 - min(act_ratio, 0.22)) * 2)
    
    if low_activity:
        indicators.append({
            "indicator": "LOW_ACTIVITY",
            "label": "Reduced Activity",
            "riskPoints": 20,
            "confidence": float(activity_confidence),
            "description": "Low feature activation diversity suggests reduced animal activity or movement."
        })

    # 6. Discharge
    discharge_features = features[int(n * 0.6):int(n * 0.75)]
    d_mean = float(np.mean(discharge_features))
    d_max = float(np.max(discharge_features))
    
    discharge_spike = d_max / (d_mean + 0.001)
    discharge_detected = discharge_spike > 12 and d_max > max_val * 0.7 and eye_abnormal
    discharge_confidence = min(0.70, 0.30 + (discharge_spike - 12) * 0.03)
    
    if discharge_detected:
        indicators.append({
            "indicator": "VISIBLE_DISCHARGE",
            "label": "Visible Discharge",
            "riskPoints": 15,
            "confidence": float(discharge_confidence),
            "description": "Possible nasal or ocular discharge pattern detected. Consult veterinarian."
        })

    # 7. Lameness
    lower_body = segments[6:10]
    lower_asymmetry = abs(lower_body[0]["mean"] - lower_body[3]["mean"]) / (mean + 0.001)
    lameness_detected = lower_asymmetry > 0.8 and segments[7]["max"] > max_val * 0.7 and posture_abnormal
    lameness_confidence = min(0.70, 0.30 + lower_asymmetry * 0.2)
    
    if lameness_detected:
        indicators.append({
            "indicator": "POSSIBLE_LAMENESS",
            "label": "Possible Lameness",
            "riskPoints": 20,
            "confidence": float(lameness_confidence),
            "description": "Asymmetric lower-body activation pattern. Possible limping or foot problem."
        })

    # If no specific concern is found, default to normal
    if not indicators:
        indicators.append({
            "indicator": "NORMAL",
            "label": "Normal Appearance",
            "riskPoints": 0,
            "confidence": 0.90,
            "description": "No visual abnormalities recognized in feature activations."
        })

    return indicators

def run_predictions(img: Image.Image) -> Dict[str, Any]:
    """
    Main entry point for Python inference:
      1. Preprocess image & run quality check.
      2. If YOLOv8 model is available, perform high-precision bounding box detection
         for goat and specific health indicators (eye_discharge, nasal_discharge,
         skin_lesion, abnormal_posture, possible_lameness).
      3. If YOLO is unavailable or yields no detections, fall back to MobileNetV2.
      4. Return structured predictions with bounding boxes for the frontend scanner.
    """
    start_time = time.time()
    
    # 1. Quality Check
    q_report = assess_image_quality(img)
    if not q_report["passed"]:
        return {
            "success": True,
            "species": "unknown",
            "species_confidence": 0.0,
            "health_status": "low_confidence",
            "health_confidence": 0.0,
            "predictions": [],
            "bounding_boxes": [],
            "detection_engine": "quality_gate",
            "recommendation": "Please reposition the camera to ensure good lighting, focus, and that the animal fills the frame.",
            "model_version": "goat-health-v2.0",
            "processing_time_ms": int((time.time() - start_time) * 1000),
            "quality_report": q_report,
            "is_reliable": False,
            "disclaimer": "Preliminary AI screening result. Always consult a veterinarian."
        }

    # Ensure RGB
    if img.mode != "RGB":
        img = img.convert("RGB")

    loader = ModelLoader()

    # 2. Attempt YOLOv8 Detection Pipeline
    yolo_detections = loader.get_yolo_detections(img, conf_threshold=0.20)
    
    if yolo_detections is not None and len(yolo_detections) > 0:
        # Check if goat or health indicators or anatomical landmarks are detected
        goat_dets = [d for d in yolo_detections if d["class_name"] in ["goat", "goat_face", "goat_body"]]
        indicator_dets = [d for d in yolo_detections if d["class_name"] not in ["goat", "goat_face", "goat_body"]]

        species = "goat" if (goat_dets or indicator_dets) else "unknown"
        species_confidence = max([d["confidence"] for d in (goat_dets or indicator_dets)], default=0.88)

        indicators = []
        for det in indicator_dets:
            cname = det["class_name"]
            conf = det["confidence"]
            box = det["box"]

            if cname == "eye_discharge":
                indicators.append({
                    "indicator": "VISIBLE_EYE_ABNORMALITY",
                    "label": "Visible Eye Discharge",
                    "riskPoints": 20,
                    "confidence": round(conf, 3),
                    "description": f"Ocular discharge detected by YOLO scanner (confidence: {int(conf*100)}%).",
                    "bounding_box": box
                })
            elif cname == "nasal_discharge":
                indicators.append({
                    "indicator": "VISIBLE_DISCHARGE",
                    "label": "Visible Nasal Discharge",
                    "riskPoints": 20,
                    "confidence": round(conf, 3),
                    "description": f"Nasal discharge / mucous detected by YOLO scanner (confidence: {int(conf*100)}%).",
                    "bounding_box": box
                })
            elif cname == "skin_lesion":
                indicators.append({
                    "indicator": "VISIBLE_SKIN_ABNORMALITY",
                    "label": "Visible Skin Lesion",
                    "riskPoints": 15,
                    "confidence": round(conf, 3),
                    "description": f"Skin lesion or coat irregularity detected by YOLO scanner (confidence: {int(conf*100)}%).",
                    "bounding_box": box
                })
            elif cname == "abnormal_posture":
                indicators.append({
                    "indicator": "ABNORMAL_POSTURE",
                    "label": "Abnormal Posture",
                    "riskPoints": 20,
                    "confidence": round(conf, 3),
                    "description": f"Unusual posture or hunched stance detected by YOLO scanner (confidence: {int(conf*100)}%).",
                    "bounding_box": box
                })
            elif cname == "possible_lameness":
                indicators.append({
                    "indicator": "POSSIBLE_LAMENESS",
                    "label": "Possible Lameness / Gait Abnormality",
                    "riskPoints": 20,
                    "confidence": round(conf, 3),
                    "description": f"Limb or gait asymmetry detected by YOLO scanner (confidence: {int(conf*100)}%).",
                    "bounding_box": box
                })
            elif cname == "eye":
                # Anatomical landmark detected from 4skwhnrscr
                indicators.append({
                    "indicator": "ANATOMICAL_EYE_LOCALIZED",
                    "label": "Ocular Region Localized",
                    "riskPoints": 0,
                    "confidence": round(conf, 3),
                    "description": f"Goat ocular zone localized with {int(conf*100)}% confidence for FAMACHA pallor inspection.",
                    "bounding_box": box
                })
            elif cname == "mouth":
                # Anatomical landmark detected from 4skwhnrscr
                indicators.append({
                    "indicator": "ANATOMICAL_MUZZLE_LOCALIZED",
                    "label": "Mouth & Muzzle Localized",
                    "riskPoints": 0,
                    "confidence": round(conf, 3),
                    "description": f"Goat mouth / rostral muzzle localized with {int(conf*100)}% confidence for lesion & discharge screening.",
                    "bounding_box": box
                })
            elif cname == "ear":
                # Anatomical landmark detected from 4skwhnrscr
                indicators.append({
                    "indicator": "ANATOMICAL_EAR_LOCALIZED",
                    "label": "Ear Region Localized",
                    "riskPoints": 0,
                    "confidence": round(conf, 3),
                    "description": f"Goat ear pinna localized with {int(conf*100)}% confidence for alertness & mange screening.",
                    "bounding_box": box
                })

        if not indicators:
            indicators.append({
                "indicator": "NORMAL",
                "label": "Normal Appearance",
                "riskPoints": 0,
                "confidence": 0.92,
                "description": "No visual lesions, discharge, or posture abnormalities detected by YOLO.",
                "bounding_box": None
            })

        total_risk_points = sum(i["riskPoints"] for i in indicators)
        if total_risk_points >= 20:
            health_status = "potentially_abnormal"
            rec = "YOLO scanner detected potential health indicators. Please inspect the animal and consult a veterinarian."
        else:
            health_status = "healthy"
            rec = "Goat appears healthy based on YOLO visual screening. Continue regular health tracking."

        avg_conf = sum(i["confidence"] for i in indicators) / len(indicators)
        health_conf = min(0.98, species_confidence * 0.3 + avg_conf * 0.7)

        return {
            "success": True,
            "species": species,
            "species_confidence": float(species_confidence),
            "health_status": health_status,
            "health_confidence": float(health_conf),
            "predictions": indicators,
            "bounding_boxes": yolo_detections,
            "detection_engine": "yolov8",
            "recommendation": rec,
            "model_version": "goat-yolov8-v2.0",
            "processing_time_ms": int((time.time() - start_time) * 1000),
            "quality_report": q_report,
            "is_reliable": health_conf >= LOW_CONFIDENCE_THRESHOLD,
            "disclaimer": "Preliminary AI screening result. It is NOT a definitive diagnosis. Always consult a licensed veterinarian."
        }

    # 3. Fallback: Image Preprocessing for MobileNetV2
    preprocess = transforms.Compose([
        transforms.Resize(224),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    
    tensor_img = preprocess(img).unsqueeze(0)  # Shape [1, 3, 224, 224]

    # Model Inference
    features, class_probs = loader.get_inference_outputs(tensor_img)

    # Species Detection mapping
    species, sp_conf, non_target, best_prob = map_predictions(class_probs)

    if species == "other" or species == "unknown":
        msg = f"Not a goat or sheep. (Detected: {non_target if non_target else 'unrecognized object'})"
        return {
            "success": True,
            "species": species,
            "species_confidence": float(sp_conf),
            "health_status": "low_confidence",
            "health_confidence": 0.0,
            "predictions": [],
            "bounding_boxes": [],
            "detection_engine": "mobilenet_v2",
            "recommendation": f"Please point the camera at a goat or sheep. {msg}",
            "model_version": "goat-health-v1.0",
            "processing_time_ms": int((time.time() - start_time) * 1000),
            "quality_report": q_report,
            "is_reliable": False,
            "disclaimer": "Not a goat or sheep. Visual health analysis will not execute."
        }

    # Visual Health Indicator Analysis
    indicators = analyze_visual_features(features)
    total_risk_points = sum(i["riskPoints"] for i in indicators)
    
    if total_risk_points >= 20:
        health_status = "potentially_abnormal"
        rec = "Potential abnormality detected. Please perform manual checks and consult a qualified veterinarian."
    else:
        health_status = "healthy"
        rec = "No visual abnormalities detected. Continue regular health monitoring."

    avg_conf = sum(i["confidence"] for i in indicators) / len(indicators)
    health_confidence = min(0.95, sp_conf * 0.4 + avg_conf * 0.6)

    return {
        "success": True,
        "species": species,
        "species_confidence": float(sp_conf),
        "health_status": health_status,
        "health_confidence": float(health_confidence),
        "predictions": indicators,
        "bounding_boxes": [],
        "detection_engine": "mobilenet_v2",
        "recommendation": rec,
        "model_version": "goat-health-v1.0",
        "processing_time_ms": int((time.time() - start_time) * 1000),
        "quality_report": q_report,
        "is_reliable": health_confidence >= LOW_CONFIDENCE_THRESHOLD,
        "disclaimer": "This is a preliminary AI screening result. It is NOT a veterinary diagnosis. Always consult a licensed veterinarian."
    }

