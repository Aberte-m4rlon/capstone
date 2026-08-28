from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: str

class DetectedIndicatorSchema(BaseModel):
    indicator: str
    label: str
    riskPoints: int = Field(..., alias="riskPoints")
    confidence: float
    description: str

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
    recommendation: str
    model_version: str
    processing_time_ms: int
    quality_report: ImageQualityReportSchema
    is_reliable: bool
    disclaimer: str
