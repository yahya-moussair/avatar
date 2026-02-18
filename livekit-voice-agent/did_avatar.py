# did_avatar.py
import os
import requests
import time

DID_API_URL = "https://api.d-id.com"
ADA_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg"

def get_headers():
    api_key = os.getenv("DID_API_KEY")
    return {
        "Authorization": f"Basic {api_key}",
        "Content-Type": "application/json"
    }

def create_talking_avatar(text: str) -> str | None:
    """Send text to D-ID and get back a video URL of Ada Lovelace talking."""
    
    # Step 1 — Create the talk
    response = requests.post(
        f"{DID_API_URL}/talks",
        headers=get_headers(),
        json={
            "source_url": ADA_IMAGE_URL,
            "script": {
                "type": "text",
                "input": text,
                "provider": {
                    "type": "microsoft",
                    "voice_id": "en-GB-SoniaNeural"  # British female voice for Ada
                }
            },
            "config": {
                "fluent": True,
                "pad_audio": 0.0
            }
        }
    )

    if response.status_code != 201:
        print(f"D-ID error creating talk: {response.text}")
        return None

    talk_id = response.json().get("id")
    print(f"D-ID talk created: {talk_id}")

    # Step 2 — Poll until video is ready
    for _ in range(30):  # wait max 30 seconds
        time.sleep(1)
        result = requests.get(
            f"{DID_API_URL}/talks/{talk_id}",
            headers=get_headers()
        )
        data = result.json()
        status = data.get("status")
        print(f"D-ID status: {status}")

        if status == "done":
            video_url = data.get("result_url")
            print(f"D-ID video ready: {video_url}")
            return video_url
        elif status == "error":
            print(f"D-ID error: {data}")
            return None

    print("D-ID timed out")
    return None