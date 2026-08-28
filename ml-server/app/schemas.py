from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: str
    detection_engine: Optional[str] = "yolov8"

class BoundingBoxSchema(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    box: List[float]  # [x1, y1, x2, y2] normalized 0..1

class DetectedIndicatorSchema(BaseModel):
    indicator: str
    label: str
    riskPoints: int = Field(..., alias="riskPoints")
    confidence: float
    description: str
    bounding_box: Optional[List[float]] = None  # [x1, y1, x2, y2] normalized

    class Config:
        populate_by_name = True

class ImageQualityReportSchema(BaseModel):
    score: int
    passed: bool
    issues: List[str]
    guidance: List[str]

class PredictResponse(BaseModel):
    success: bool
    species: str
    species_confidence: float
    health_status: str
    health_confidence: float
    predictions: List[DetectedIndicatorSchema]
    bounding_boxes: Optional[List[BoundingBoxSchema]] = []
    detection_engine: Optional[str] = "yolov8"
    recommendation: str
    model_version: str
    processing_time_ms: int
    quality_report: ImageQualityReportSchema
    is_reliable: bool
    disclaimer: str

