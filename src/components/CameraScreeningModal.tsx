/**
 * CameraScreeningModal — AI Livestock Health Scanner UI
 *
 * Fully integrated with Gemini Vision API + Dynamic Bounding Boxes.
 * Wraps CameraFirstHealthModal so every camera screening entry point
 * in AlpasFarm provides the exact same high-precision, farmer-friendly experience.
 */
import { CameraFirstHealthModal } from './domain/health/CameraFirstHealthModal';
import { useAuth } from '../lib/auth';
import type { Animal } from '../types';
import type { FarmHealthContext } from '../lib/cameraML';

interface Props {
  animalId: string;
  animalName: string;
  animalTag: string;
  animal?: Animal;
  farmContext?: FarmHealthContext;
  onClose: () => void;
  onSaved?: () => void;
}

export function CameraScreeningModal({
  animalId,
  animalName,
  animalTag,
  animal,
  farmContext,
  onClose,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const farmAnimals = animal ? [animal] : [];

  return (
    <CameraFirstHealthModal
      open={true}
      onClose={onClose}
      onSuccess={onSaved}
      farmAnimals={farmAnimals}
      preselectedAnimalId={animalId}
      currentUserId={user?.id}
    />
  );
}
