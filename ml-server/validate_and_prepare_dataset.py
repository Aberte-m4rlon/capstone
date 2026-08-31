#!/usr/bin/env python3
"""
validate_and_prepare_dataset.py — AlpasFarm Sheep & Goat Dataset Validator and Preparation Tool

This script:
1. Inspects and validates the raw image dataset in ml-server/sheep_goat/ (goat and sheep folders).
2. Verifies image integrity, formats, and resolutions.
3. Generates train/val/test splits (80% train, 10% val, 10% test).
4. Generates YOLO annotation metadata and data.yaml with classes [0: goat, 1: sheep].
5. Produces a detailed validation report in JSON and text format.
"""

import os
import sys
import json
import random
import shutil
from pathlib import Path
from PIL import Image

def validate_and_prepare(
    dataset_dir: Path,
    output_yolo_dir: Path,
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1
):
    print("=" * 70)
    print("  AlpasFarm Goat & Sheep Dataset Validator & Preparation Tool")
    print("=" * 70)
    print(f"  Source Dataset: {dataset_dir}")
    print(f"  Output YOLO:    {output_yolo_dir}")
    print("-" * 70)

    if not dataset_dir.exists():
        print(f"[Error] Dataset directory does not exist: {dataset_dir}")
        return False

    classes = ["goat", "sheep"]
    stats = {
        "dataset_path": str(dataset_dir),
        "classes": classes,
        "class_counts": {},
        "valid_images": 0,
        "corrupt_images": 0,
        "image_sizes": {},
        "splits": {
            "train": {"goat": 0, "sheep": 0, "total": 0},
            "val": {"goat": 0, "sheep": 0, "total": 0},
            "test": {"goat": 0, "sheep": 0, "total": 0}
        },
        "errors": []
    }

    class_images = {"goat": [], "sheep": []}

    for cls_name in classes:
        cls_dir = dataset_dir / cls_name
        if not cls_dir.exists():
            print(f"[Warning] Subdirectory missing for class '{cls_name}': {cls_dir}")
            stats["errors"].append(f"Missing folder: {cls_dir}")
            continue

        files = list(cls_dir.glob("*.*"))
        valid_files = []
        for f in files:
            ext = f.suffix.lower()
            if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
                continue
            try:
                with Image.open(f) as img:
                    img.verify()
                with Image.open(f) as img:
                    w, h = img.size
                    size_key = f"{w}x{h}"
                    stats["image_sizes"][size_key] = stats["image_sizes"].get(size_key, 0) + 1
                valid_files.append(f)
                stats["valid_images"] += 1
            except Exception as e:
                stats["corrupt_images"] += 1
                stats["errors"].append(f"Corrupt image {f.name}: {str(e)}")

        class_images[cls_name] = valid_files
        stats["class_counts"][cls_name] = len(valid_files)
        print(f"  [Class: {cls_name:5s}] Found {len(valid_files)} valid images ({len(files) - len(valid_files)} skipped/corrupt)")

    # Prepare YOLO folder structure
    for split in ["train", "val", "test"]:
        (output_yolo_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_yolo_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    random.seed(42)

    for cls_idx, cls_name in enumerate(classes):
        imgs = class_images[cls_name]
        random.shuffle(imgs)
        n = len(imgs)
        n_train = int(n * train_ratio)
        n_val = int(n * val_ratio)
        n_test = n - n_train - n_val

        splits_map = {
            "train": imgs[:n_train],
            "val": imgs[n_train:n_train + n_val],
            "test": imgs[n_train + n_val:]
        }

        for split, split_imgs in splits_map.items():
            stats["splits"][split][cls_name] = len(split_imgs)
            stats["splits"][split]["total"] += len(split_imgs)

            for img_path in split_imgs:
                dest_img = output_yolo_dir / "images" / split / f"{cls_name}_{img_path.name}"
                dest_lbl = output_yolo_dir / "labels" / split / f"{cls_name}_{img_path.stem}.txt"

                shutil.copy2(img_path, dest_img)

                # Generate normalized centered pseudo-bounding box for single animal classification images
                # YOLO format: class_id x_center y_center width height (normalized 0..1)
                with open(dest_lbl, "w") as f_lbl:
                    f_lbl.write(f"{cls_idx} 0.5 0.5 0.88 0.88\n")

    # Generate data.yaml
    data_yaml_content = f"""# AlpasFarm Goat & Sheep YOLO Detection Dataset Config
path: {output_yolo_dir.resolve().as_posix()}
train: images/train
val: images/val
test: images/test

nc: 2
names: ['goat', 'sheep']
"""
    with open(output_yolo_dir / "data.yaml", "w") as f:
        f.write(data_yaml_content)

    # Save JSON report
    report_file = dataset_dir / "validation_report.json"
    with open(report_file, "w") as f:
        json.dump(stats, f, indent=2)

    print("-" * 70)
    print("  Dataset Preparation Summary:")
    print(f"  - Total Valid Images:  {stats['valid_images']}")
    print(f"  - Train Split:         {stats['splits']['train']['total']} (Goat: {stats['splits']['train']['goat']}, Sheep: {stats['splits']['train']['sheep']})")
    print(f"  - Val Split:           {stats['splits']['val']['total']} (Goat: {stats['splits']['val']['goat']}, Sheep: {stats['splits']['val']['sheep']})")
    print(f"  - Test Split:          {stats['splits']['test']['total']} (Goat: {stats['splits']['test']['goat']}, Sheep: {stats['splits']['test']['sheep']})")
    print(f"  - Config Created:      {output_yolo_dir / 'data.yaml'}")
    print(f"  - Report Saved:        {report_file}")
    print("=" * 70)
    return True

if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    dataset = base / "sheep_goat"
    yolo_out = base / "processed_sheep_goat_yolo"
    validate_and_prepare(dataset, yolo_out)
