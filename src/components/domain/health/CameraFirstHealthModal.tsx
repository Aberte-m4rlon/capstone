/**
 * CameraFirstHealthModal.tsx — Real-Time Livestock Health Scanner for ALPASFARM
 *
 * Dedicated real-time livestock detection camera interface:
 * 1. Dedicated full-screen live camera view (TOP bar, full live feed, overlay canvas, floating HUD, scan control).
 * 2. Real-time temporal stabilization and IoU tracking with zero jitter or flickering.
 * 3. Gemini Vision API invoked only when farmer taps "Suriin ang Napili".
 * 4. High-contrast bounding boxes around genuine goats and sheep only.
 * 5. Clean post-scan health result view with persistent Supabase storage and health_records insert.
 */

import React from 'react';
import { LiveObjectDetectionCamera } from './LiveObjectDetectionCamera';
import type { Animal, InventoryItem, HealthRecord } from '../../../types';

export interface CameraFirstHealthModalProps {
  open: boolean;
  onClose: () => void;
  farmAnimals?: Animal[];
  inventory?: InventoryItem[];
  currentUserId?: string;
  isSuperAdmin?: boolean;
  preselectedAnimalId?: string;
  onSuccess?: (record?: HealthRecord) => void;
}

export interface HealthScanResult {
  detectedSpecies: 'Goat' | 'Sheep' | 'Unknown';
  speciesLabelTagalog: string;
  matchedAnimal: Animal | null;
  condition?: 'Maayos' | 'Bantayan' | 'Kailangan ng Atensyon' | 'Kailangan ng Gamot';
  conditionSummary?: string;
  structuredObservations?: { category: string; finding: string; visibility: 'visible' | 'limited' | 'not_visible' }[];
  visualObservations: string[];
  suggestedConditions: string[];
  healthStatus: 'healthy' | 'monitor' | 'attention' | 'medication';
  healthStatusLabel: string;
  recommendation: string;
  limitations?: string[];
  temperatureDisplay: string;
  notesSnippet: string;
  capturedImageUrl?: string;
  croppedImageUrl?: string;
  scannedAt: string;
}

export type CameraLifecycleState =
  | 'INITIALIZING'
  | 'DETECTING'
  | 'GOAT_DETECTED'
  | 'SHEEP_DETECTED'
  | 'OTHER_DETECTED'
  | 'UNCERTAIN'
  | 'NO_DETECTION'
  | 'CAPTURING'
  | 'ANALYZING'
  | 'RESULT'
  | 'ERROR';

export function CameraFirstHealthModal({
  open,
  onClose,
  preselectedAnimalId,
  onSuccess,
}: CameraFirstHealthModalProps) {
  if (!open) return null;

  return (
    <LiveObjectDetectionCamera
      onClose={onClose}
      preselectedAnimalId={preselectedAnimalId}
      onHealthCheckSaved={(record) => {
        if (onSuccess) onSuccess(record);
      }}
    />
  );
}

export default CameraFirstHealthModal;
