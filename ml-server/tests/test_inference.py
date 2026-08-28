import unittest
import requests
import io
from PIL import Image

class TestMLServer(unittest.TestCase):
    BASE_URL = "http://localhost:8000"
    API_KEY = "alpasfarm_ml_secret_key_2026"

    def test_01_health_check(self):
        """Verify the GET /health endpoint response structure and status"""
        try:
            resp = requests.get(f"{self.BASE_URL}/health", timeout=5)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "healthy")
            self.assertTrue("model_loaded" in data)
            self.assertEqual(data["model_version"], "goat-health-v1.0")
        except requests.ConnectionError:
            self.skipTest("FastAPI server is not running on localhost:8000. Run uvicorn first.")

    def test_02_predict_unauthorized(self):
        """Verify prediction endpoint rejects missing or invalid header API keys"""
        try:
            # Create a 224x224 sample image
            img = Image.new("RGB", (224, 224), color="green")
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            buf.seek(0)

            # Missing header
            files = {"image": ("test.jpg", buf, "image/jpeg")}
            resp = requests.post(f"{self.BASE_URL}/api/v1/predict", files=files)
            self.assertEqual(resp.status_code, 401)

            # Incorrect key header
            buf.seek(0)
            headers = {"X-API-Key": "wrong_key"}
            resp = requests.post(f"{self.BASE_URL}/api/v1/predict", files=files, headers=headers)
            self.assertEqual(resp.status_code, 401)
        except requests.ConnectionError:
            self.skipTest("FastAPI server is not running.")

    def test_03_predict_success(self):
        """Verify inference flow with a valid test image"""
        try:
            # Create a valid test image
            img = Image.new("RGB", (300, 300), color=(128, 128, 128))
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            buf.seek(0)

            files = {"image": ("test.jpg", buf, "image/jpeg")}
            headers = {"X-API-Key": self.API_KEY}
            resp = requests.post(f"{self.BASE_URL}/api/v1/predict", files=files, headers=headers)
            
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data["success"])
            self.assertTrue("species" in data)
            self.assertTrue("health_status" in data)
            self.assertTrue("predictions" in data)
            self.assertTrue("quality_report" in data)
            self.assertTrue("processing_time_ms" in data)
        except requests.ConnectionError:
            self.skipTest("FastAPI server is not running.")

if __name__ == "__main__":
    unittest.main()
