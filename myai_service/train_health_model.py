"""
train_health_model.py — AlpasFarm Health Screening Model Training
=================================================================
Dataset: alpasfarm_goat_health_training_sample.csv (SYNTHETIC)
Target:  health_label  (healthy / suspected_ill)

Phases:
  1. Load & inspect dataset
  2. Preprocess (numeric scaling, categorical encoding, booleans)
  3. Train Random Forest on train split
  4. Evaluate on validation split (model selection)
  5. Final evaluation on held-out test split
  6. Save model + preprocessor artifacts

IMPORTANT:
  This dataset is SYNTHETIC. The trained model is for development
  and testing purposes only. It must NOT be presented as clinically
  validated. Veterinary confirmation is always required.

Run from the myai_service/ directory:
    python train_health_model.py --csv PATH_TO_CSV
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder

# ── Configuration ──────────────────────────────────────────────────────────────

NUMERIC_FEATURES = [
    "age_months",
    "weight_kg",
    "temperature_c",
    "heart_rate_bpm",
    "respiratory_rate_bpm",
    "weight_loss_kg_30d",
]

CATEGORICAL_FEATURES = ["appetite", "activity_level"]

BINARY_FEATURES = ["cough", "nasal_discharge", "diarrhea", "lameness"]

# animal_id and species are excluded:
#   animal_id  — identifier, not predictive
#   species    — all records are 'goat'; zero variance
# split and health_label are not features

TARGET = "health_label"
POSITIVE_CLASS = "suspected_ill"   # the class we care about for recall
MODEL_VERSION = "health-risk-v1.0.0"

ARTIFACTS_DIR = Path(__file__).parent / "models"

# ── Phase 1: Load & Inspect ────────────────────────────────────────────────────

def load_and_inspect(csv_path: str) -> pd.DataFrame:
    print("\n" + "=" * 60)
    print("PHASE 1 — DATASET INSPECTION")
    print("=" * 60)

    df = pd.read_csv(csv_path)
    print(f"Total records     : {len(df)}")
    print(f"Columns           : {list(df.columns)}")
    print(f"\nDtypes:\n{df.dtypes}")
    print(f"\nMissing values:\n{df.isnull().sum()}")

    dupes = df.duplicated().sum()
    print(f"\nDuplicate rows    : {dupes}")

    print(f"\nClass distribution:")
    for label, count in df[TARGET].value_counts().items():
        pct = count / len(df) * 100
        print(f"  {label:<20} {count:>5}  ({pct:.1f}%)")

    print(f"\nSplit distribution:")
    for split, count in df["split"].value_counts().items():
        print(f"  {split:<15} {count:>5}")

    print(f"\nNumerical feature ranges:")
    print(df[NUMERIC_FEATURES].describe().round(2).to_string())

    print(f"\nCategorical value counts:")
    for col in CATEGORICAL_FEATURES:
        print(f"  {col}: {df[col].value_counts().to_dict()}")

    print(f"\nBinary feature sums (1 = present):")
    for col in BINARY_FEATURES:
        print(f"  {col}: {df[col].sum()} / {len(df)}")

    return df


# ── Phase 2-3: Preprocess ─────────────────────────────────────────────────────

def build_splits(df: pd.DataFrame):
    """Split into train / val / test using the 'split' column."""
    feature_cols = NUMERIC_FEATURES + CATEGORICAL_FEATURES + BINARY_FEATURES

    train = df[df["split"] == "train"].copy()
    val   = df[df["split"] == "validation"].copy()
    test  = df[df["split"] == "test"].copy()

    X_train = train[feature_cols]
    y_train = (train[TARGET] == POSITIVE_CLASS).astype(int)

    X_val = val[feature_cols]
    y_val = (val[TARGET] == POSITIVE_CLASS).astype(int)

    X_test = test[feature_cols]
    y_test = (test[TARGET] == POSITIVE_CLASS).astype(int)

    print(f"\n{'=' * 60}")
    print("PHASE 2-3 — PREPROCESSING")
    print("=" * 60)
    print(f"Train   : {len(X_train)} records  | positive: {y_train.sum()} ({y_train.mean()*100:.1f}%)")
    print(f"Val     : {len(X_val)} records  | positive: {y_val.sum()} ({y_val.mean()*100:.1f}%)")
    print(f"Test    : {len(X_test)} records  | positive: {y_test.sum()} ({y_test.mean()*100:.1f}%)")

    return X_train, y_train, X_val, y_val, X_test, y_test


def build_preprocessor():
    """
    ColumnTransformer:
      Numeric  → StandardScaler
      Categorical → OneHotEncoder (handle unknown)
      Binary   → passthrough (already 0/1)
    """
    numeric_pipeline    = Pipeline([("scaler", StandardScaler())])
    categorical_pipeline = Pipeline([
        ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("num",  numeric_pipeline,    NUMERIC_FEATURES),
            ("cat",  categorical_pipeline, CATEGORICAL_FEATURES),
            ("bin",  "passthrough",        BINARY_FEATURES),
        ],
        remainder="drop",
    )
    return preprocessor


# ── Phase 4: Train ─────────────────────────────────────────────────────────────

def train_model(X_train, y_train, X_val, y_val):
    print(f"\n{'=' * 60}")
    print("PHASE 4 — TRAINING")
    print("=" * 60)

    preprocessor = build_preprocessor()

    # Random Forest — good for tabular health data:
    # - handles non-linear relationships (e.g. temperature × activity interaction)
    # - less sensitive to feature scaling than logistic regression
    # - provides feature importances
    # - naturally handles class imbalance via class_weight='balanced'
    rf_model = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=5,
        class_weight="balanced",   # handles healthy/suspected_ill imbalance
        random_state=42,
        n_jobs=1,   # n_jobs=-1 uses joblib parallel which has a Python 3.14 ast.Num bug
    )

    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier",   rf_model),
    ])

    print("Training Random Forest (n_estimators=200, class_weight='balanced')…")
    pipeline.fit(X_train, y_train)

    # Validation check
    val_preds = pipeline.predict(X_val)
    val_recall = recall_score(y_val, val_preds, zero_division=0)
    val_f1     = f1_score(y_val, val_preds, zero_division=0)
    val_acc    = accuracy_score(y_val, val_preds)
    print(f"\nValidation accuracy : {val_acc*100:.1f}%")
    print(f"Validation recall   : {val_recall*100:.1f}%   (for suspected_ill)")
    print(f"Validation F1       : {val_f1*100:.1f}%")

    return pipeline


# ── Phase 5: Evaluate on test set ─────────────────────────────────────────────

def evaluate_model(pipeline, X_test, y_test):
    print(f"\n{'=' * 60}")
    print("PHASE 5 — TEST SET EVALUATION")
    print("=" * 60)

    y_pred  = pipeline.predict(X_test)
    y_proba = pipeline.predict_proba(X_test)[:, 1]  # probability of suspected_ill

    acc       = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall    = recall_score(y_test, y_pred, zero_division=0)
    f1        = f1_score(y_test, y_pred, zero_division=0)
    cm        = confusion_matrix(y_test, y_pred)

    print(f"\nModel        : Random Forest Classifier")
    print(f"Accuracy     : {acc*100:.1f}%")
    print(f"Precision    : {precision*100:.1f}%  (of predicted ill, how many actually ill)")
    print(f"Recall       : {recall*100:.1f}%  (of actually ill, how many caught) ← KEY METRIC")
    print(f"F1 Score     : {f1*100:.1f}%")
    print(f"\nConfusion Matrix:")
    print(f"                 Predicted healthy   Predicted suspected_ill")
    print(f"  Actual healthy        {cm[0][0]}                  {cm[0][1]}")
    print(f"  Actual susp_ill       {cm[1][0]}                  {cm[1][1]}")

    print(f"\nFull classification report:")
    print(classification_report(y_test, y_pred, target_names=["healthy", "suspected_ill"]))

    print("\n── Why recall matters for illness screening ──")
    print(f"  False negatives (missed ill animals): {cm[1][0]}")
    print(f"  A model that misses a sick animal is more dangerous than one")
    print(f"  that flags a healthy one for extra attention.")
    print(f"  class_weight='balanced' was used to improve recall on the minority class.")

    metrics = {
        "accuracy":  round(acc, 4),
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "confusion_matrix": cm.tolist(),
        "test_samples": len(y_test),
        "positive_samples": int(y_test.sum()),
    }
    return metrics


# ── Phase 6: Save artifacts ────────────────────────────────────────────────────

def save_artifacts(pipeline, metrics: dict, csv_path: str):
    print(f"\n{'=' * 60}")
    print("PHASE 6 — SAVING MODEL ARTIFACTS")
    print("=" * 60)

    ARTIFACTS_DIR.mkdir(exist_ok=True)

    model_path = ARTIFACTS_DIR / "health_model.joblib"
    joblib.dump(pipeline, model_path)
    print(f"Model saved       : {model_path}")

    # Build feature names after OHE for documentation
    ohe = pipeline.named_steps["preprocessor"].named_transformers_["cat"]["ohe"]
    cat_feature_names = list(ohe.get_feature_names_out(CATEGORICAL_FEATURES))
    all_feature_names = NUMERIC_FEATURES + cat_feature_names + BINARY_FEATURES

    # Feature importances
    rf = pipeline.named_steps["classifier"]
    importances = rf.feature_importances_
    feat_importance_pairs = sorted(
        zip(all_feature_names, importances), key=lambda x: x[1], reverse=True
    )

    metadata = {
        "model_name":       "AlpasFarm Health Screening Model",
        "version":          MODEL_VERSION,
        "algorithm":        "RandomForestClassifier",
        "trained_at":       datetime.now(timezone.utc).isoformat(),
        "training_dataset": Path(csv_path).name,
        "dataset_type":     "SYNTHETIC — NOT clinically validated veterinary data",
        "target_variable":  TARGET,
        "positive_class":   POSITIVE_CLASS,
        "features": {
            "numeric":     NUMERIC_FEATURES,
            "categorical": CATEGORICAL_FEATURES,
            "binary":      BINARY_FEATURES,
            "excluded":    ["animal_id", "species"],
        },
        "preprocessing": {
            "numeric":     "StandardScaler",
            "categorical": "OneHotEncoder(handle_unknown='ignore')",
            "binary":      "passthrough (already 0/1)",
        },
        "hyperparameters": {
            "n_estimators":    200,
            "max_depth":       12,
            "min_samples_leaf": 5,
            "class_weight":    "balanced",
            "random_state":    42,
        },
        "evaluation": metrics,
        "feature_importances": [
            {"feature": f, "importance": round(float(imp), 5)}
            for f, imp in feat_importance_pairs[:15]
        ],
        "disclaimer": (
            "This model was trained on a SYNTHETIC dataset. "
            "It is an early-warning screening tool only. "
            "Veterinary confirmation is required for any health concern. "
            "DO NOT present results as veterinary diagnosis."
        ),
    }

    meta_path = ARTIFACTS_DIR / "health_model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved    : {meta_path}")

    print(f"\nTop 10 feature importances:")
    for feat, imp in feat_importance_pairs[:10]:
        bar = "█" * int(imp * 50)
        print(f"  {feat:<30} {imp:.4f}  {bar}")

    return str(model_path), metadata


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train AlpasFarm health screening model")
    parser.add_argument(
        "--csv",
        default=r"C:\Users\ACER\Downloads\alpasfarm_goat_health_training_sample.csv",
        help="Path to training CSV",
    )
    args = parser.parse_args()

    if not Path(args.csv).exists():
        print(f"ERROR: CSV not found at {args.csv}")
        sys.exit(1)

    # Phase 1
    df = load_and_inspect(args.csv)

    # Phase 2-3
    X_train, y_train, X_val, y_val, X_test, y_test = build_splits(df)

    # Phase 4
    pipeline = train_model(X_train, y_train, X_val, y_val)

    # Phase 5
    metrics = evaluate_model(pipeline, X_test, y_test)

    # Phase 6
    model_path, metadata = save_artifacts(pipeline, metrics, args.csv)

    print(f"\n{'=' * 60}")
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"Model artifact    : {model_path}")
    print(f"Version           : {metadata['version']}")
    print(f"Accuracy          : {metrics['accuracy']*100:.1f}%")
    print(f"Recall            : {metrics['recall']*100:.1f}%  (for suspected_ill)")
    print(f"F1                : {metrics['f1']*100:.1f}%")
    print(f"\n⚠ REMINDER: Dataset is SYNTHETIC. Not for clinical use.")


if __name__ == "__main__":
    main()
