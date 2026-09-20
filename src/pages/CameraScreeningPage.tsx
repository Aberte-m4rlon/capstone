import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LiveObjectDetectionCamera } from '../components/domain/health/LiveObjectDetectionCamera';

export function CameraScreeningPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const animalId = searchParams.get('animalId') || undefined;

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/health');
    }
  };

  const handleSaved = () => {
    navigate('/health');
  };

  return (
    <LiveObjectDetectionCamera
      onClose={handleClose}
      preselectedAnimalId={animalId}
      onHealthCheckSaved={handleSaved}
    />
  );
}

export default CameraScreeningPage;

