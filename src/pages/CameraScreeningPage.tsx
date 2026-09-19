/**
 * CameraScreeningPage.tsx — Deprecated separate camera page.
 *
 * Consolidated directly into CameraFirstHealthModal within the Health Check flow.
 * Automatically redirects to /health?action=check to open the single unified Health Check modal.
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function CameraScreeningPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const qId = searchParams.get('animalId');
    navigate(qId ? `/health?action=check&animalId=${qId}` : '/health?action=check', { replace: true });
  }, [navigate, searchParams]);

  return null;
}

export default CameraScreeningPage;
