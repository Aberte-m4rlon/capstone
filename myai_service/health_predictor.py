"""
health_predictor.py — AlpasFarm Health Screening Prediction Service
====================================================================
Loads the trained Random Forest model and provides prediction functions.
Called by the FastAPI ML endpoints in main.py.

IMPORTANT:
  - ML probability is NOT the same as the veterinary risk score.
  - The veterinary rule engine remains authoritative.
  - This is an early-warning screening tool only.
  - Always recommend veterinary confirmation.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

# ── Artifact paths ────────────────────────────────────────────────────────────

MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH  = MODELS_DIR / "health_model.joblib"
META_PATH   = MODELS_DIR / "health_model_metadata.json"

# ── Feature config (must match train_health_model.py exactly) ─────────────────

NUMERIC_FEATURES     = ["age_months", "weight_kg", "temperature_c",
                         "heart_rate_bpm", "respiratory_rate_bpm", "weight_loss_kg_30d"]
CATEGORICAL_FEATURES = ["appetite", "activity_level"]
BINARY_FEATURES      = ["cough", "nasal_discharge", "diarrhea", "lameness"]
ALL_FEATURES         = NUMERIC_FEATURES + CATEGORICAL_FEATURES + BINARY_FEATURES

VALID_APPETITE        = {"normal", "reduced", "poor"}
VALID_ACTIVITY        = {"normal", "reduced", "lethargic"}
POSITIVE_CLASS        = "suspected_ill"

# ── Model cache ───────────────────────────────────────────────────────────────

_pipeline  = None
_metadata  = None
_load_error: Optional[str] = None


def _load_model():
    global _pipeline, _metadata, _load_error
    if _pipeline is not None:
        return True
    if not MODEL_PATH.exists():
        _load_error = (
            f"Model file not found: {MODEL_PATH}. "
            "Run train_health_model.py first."
        )
        return False
    try:
        _pipeline = joblib.load(MODEL_PATH)
        if META_PATH.exists():
            with open(META_PATH) as f:
                _metadata = json.load(f)
        return True
    except Exception as e:
        _load_error = f"Failed to load model: {e}"
        return False


def get_model_status() -> dict:
    """Return current model load status and metadata."""
    loaded = _load_model()
    return {
        "model_loaded": loaded,
        "model_path": str(MODEL_PATH),
        "error": _load_error if not loaded else None,
        "metadata": _metadata,
    }


# ── Input validation ──────────────────────────────────────────────────────────

class ValidationError(Exception):
    pass


def validate_input(data: dict) -> dict:
    """
    Validate and coerce prediction input.
    Returns cleaned dict or raises ValidationError.
    """
    errors = []

    # Numeric fields
    numeric_ranges = {
        "age_months":          (0,   240),
        "weight_kg":           (0.5, 200),
        "temperature_c":       (35,  43),
        "heart_rate_bpm":      (20,  200),
        "respiratory_rate_bpm":(5,   80),
        "weight_loss_kg_30d":  (-10, 20),
    }
    cleaned = {}
    for field, (lo, hi) in numeric_ranges.items():
        val = data.get(field)
        if val is None:
            errors.append(f"Missing required field: {field}")
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            errors.append(f"Invalid value for {field}: must be numeric")
            continue
        if not (lo <= val <= hi):
            errors.append(f"{field}={val} is outside expected range [{lo}, {hi}]")
            continue
        cleaned[field] = val

    # Categorical
    for field, valid_set in [("appetite", VALID_APPETITE), ("activity_level", VALID_ACTIVITY)]:
        val = data.get(field, "").lower().strip()
        if val not in valid_set:
            errors.append(f"Invalid {field}='{val}'. Must be one of: {sorted(valid_set)}")
        else:
            cleaned[field] = val

    # Binary
    for field in BINARY_FEATURES:
        val = data.get(field, 0)
        try:
            val = int(val)
            if val not in (0, 1):
                raise ValueError()
            cleaned[field] = val
        except (TypeError, ValueError):
            errors.append(f"Invalid {field}='{val}'. Must be 0 or 1.")

    if errors:
        raise ValidationError("; ".join(errors))

    return cleaned


# ── Prediction ────────────────────────────────────────────────────────────────

def predict(input_data: dict, animal_id: str = "") -> dict:
    """
    Run ML health screening prediction.

    Returns:
        prediction         "healthy" | "suspected_ill"
        ml_probability     float 0–1 (probability of suspected_ill from model)
        ml_probability_pct int 0–100
        screening_status   "needs_attention" | "no_concern"
        risk_label         "Needs Attention" | "No Obvious Concern"
        model_version      str
        top_features       list of contributing features
        disclaimer         str
        timestamp          str

    IMPORTANT DISTINCTION:
        ml_probability   = Random Forest probability (from synthetic training data)
        veterinary_score = AlpasFarm rule-based score (always authoritative)
        These are SEPARATE values. Do not combine them or equate them.
    """
    if not _load_model():
        raise RuntimeError(_load_error or "Model not available")

    # Validate
    cleaned = validate_input(input_data)

    # Build DataFrame in the exact column order the pipeline expects
    row = {f: cleaned.get(f, 0) for f in ALL_FEATURES}
    X = pd.DataFrame([row], columns=ALL_FEATURES)

    # Run inference
    proba_arr = _pipeline.predict_proba(X)[0]
    classes   = list(_pipeline.classes_)

    # probability of suspected_ill (class = 1 in training encoding)
    ill_idx      = 1  # training used (target == "suspected_ill").astype(int)
    ml_probability = float(proba_arr[ill_idx])
    prediction     = POSITIVE_CLASS if ml_probability >= 0.5 else "healthy"

    # Screening status (not veterinary risk score)
    screening_status = "needs_attention" if prediction == POSITIVE_CLASS else "no_concern"
    risk_label       = "Needs Attention" if prediction == POSITIVE_CLASS else "No Obvious Concern"

    # Top contributing features — use feature importances from RF
    rf = _pipeline.named_steps["classifier"]
    preprocessor = _pipeline.named_steps["preprocessor"]
    ohe = preprocessor.named_transformers_["cat"]["ohe"]
    cat_names = list(ohe.get_feature_names_out(CATEGORICAL_FEATURES))
    feat_names = NUMERIC_FEATURES + cat_names + BINARY_FEATURES
    importances = rf.feature_importances_
    top = sorted(zip(feat_names, importances), key=lambda x: x[1], reverse=True)[:5]

    # Map back to human-readable names
    label_map = {
        "temperature_c":       f"Temperature {cleaned.get('temperature_c','?')}°C",
        "heart_rate_bpm":      f"Heart rate {cleaned.get('heart_rate_bpm','?')} BPM",
        "respiratory_rate_bpm":f"Respiratory rate {cleaned.get('respiratory_rate_bpm','?')}/min",
        "age_months":          f"Age {cleaned.get('age_months','?')} months",
        "weight_kg":           f"Weight {cleaned.get('weight_kg','?')} kg",
        "weight_loss_kg_30d":  f"Weight change {cleaned.get('weight_loss_kg_30d','?')} kg/30d",
        "diarrhea":            "Diarrhea present" if cleaned.get("diarrhea") else None,
        "cough":               "Cough present"    if cleaned.get("cough")    else None,
        "nasal_discharge":     "Nasal discharge"  if cleaned.get("nasal_discharge") else None,
        "lameness":            "Lameness present" if cleaned.get("lameness") else None,
    }

    top_features = []
    for fname, imp in top:
        base = fname.split("_normal")[0].split("_reduced")[0].split("_poor")[0].split("_lethargic")[0]
        if base == "appetite":
            label = f"Appetite: {cleaned.get('appetite','?')}"
        elif base == "activity_level":
            label = f"Activity level: {cleaned.get('activity_level','?')}"
        elif base in label_map and label_map[base]:
            label = label_map[base]
        else:
            label = fname
        top_features.append({"feature": fname, "label": label, "importance": round(imp, 4)})

    return {
        "animal_id":         animal_id,
        "prediction":        prediction,
        "ml_probability":    round(ml_probability, 4),
        "ml_probability_pct":int(round(ml_probability * 100)),
        "screening_status":  screening_status,
        "risk_label":        risk_label,
        "model_version":     _metadata.get("version", "health-risk-v1.0.0") if _metadata else "health-risk-v1.0.0",
        "top_features":      top_features,
        "disclaimer": (
            "ML health screening is an early-warning tool trained on a SYNTHETIC dataset. "
            "It is NOT a veterinary diagnosis. "
            "The AlpasFarm veterinary rule engine remains the authoritative health assessment. "
            "Always consult a licensed veterinarian for any health concern."
        ),
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "dataset_type":      "synthetic",
    }


def batch_predict(records: list[dict]) -> list[dict]:
    """Predict for a list of animal records. Skips records with validation errors."""
    results = []
    for rec in records:
        animal_id = rec.pop("animal_id", "")
        try:
            result = predict(rec, animal_id)
            results.append(result)
        except (ValidationError, RuntimeError) as e:
            results.append({
                "animal_id": animal_id,
                "error": str(e),
                "prediction": None,
            })
    return results
