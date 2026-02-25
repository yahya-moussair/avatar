"""
Quick check that CARTESIA_API_KEY works with the TTS API.
Run from repo root: uv run python scripts/check_cartesia.py
Requires: python-dotenv, aiohttp (or use requests if you prefer).
"""
import asyncio
import os
import sys

# Load .env.local from livekit-voice-agent
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

try:
    import aiohttp
except ImportError:
    print("Install aiohttp: uv add aiohttp")
    sys.exit(1)

API_KEY = os.getenv("CARTESIA_API_KEY")
BASE = "https://api.cartesia.ai"
VOICE_ID = "f786b574-daa5-4673-aa0c-cbe3e8534c02"  # Katie


async def main():
    if not API_KEY:
        print("Missing CARTESIA_API_KEY in .env.local")
        sys.exit(1)
    print("Testing Cartesia TTS (sonic, bytes endpoint)...")
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BASE}/tts/bytes",
            headers={
                "X-API-Key": API_KEY,
                "Cartesia-Version": "2024-06-10",
                "Content-Type": "application/json",
            },
            json={
                "model_id": "sonic-3",
                "transcript": "Hello, this is a test.",
                "voice": {"mode": "id", "id": VOICE_ID},
                "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000},
                "language": "en",
            },
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            body = await resp.text()
            print(f"Status: {resp.status} {resp.reason}")
            if not resp.ok:
                print(f"Body: {body[:500]}")
                if resp.status == 401:
                    print("→ Check CARTESIA_API_KEY: get a key at https://cartesia.ai")
                elif resp.status == 403:
                    print("→ Key may not have access to this model/voice or quota exceeded.")
                sys.exit(1)
    print("OK: Cartesia API key works.")


if __name__ == "__main__":
    asyncio.run(main())
