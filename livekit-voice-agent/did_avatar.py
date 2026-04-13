# did_avatar.py
import os
import requests
import time

DID_API_URL = "https://api.d-id.com"
ADA_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg"

def _is_arabic_text(text: str) -> bool:
    # Basic Unicode Arabic blocks + Arabic presentation forms
    return any(
        ("\u0600" <= ch <= "\u06FF")
        or ("\u0750" <= ch <= "\u077F")
        or ("\u08A0" <= ch <= "\u08FF")
        or ("\uFB50" <= ch <= "\uFDFF")
        or ("\uFE70" <= ch <= "\uFEFF")
        for ch in text
    )

def _voice_id_for_text(text: str) -> str:
    # D-ID uses Azure (microsoft) neural voices via voice_id.
    # Pick an Arabic voice for Arabic text; otherwise keep the existing English voice.
    return "ar-SA-ZariyahNeural" if _is_arabic_text(text) else "en-GB-SoniaNeural"


def _infer_expression_from_text(text: str) -> str:
    """
    Heuristic mapping from text content to a D-ID facial expression.
    Supported expressions (per D-ID API): 'neutral', 'happy', 'serious', 'surprise'.
    We map 'sad' and 'angry' style content to 'serious'.
    """
    lowered = text.lower()

    # Very rough sentiment cues
    if any(w in lowered for w in ["sorry", "sad", "sorrow", "regret", "unfortunate", "terrible", "awful"]):
        return "serious"
    if any(w in lowered for w in ["angry", "furious", "cross", "annoyed", "upset"]):
        return "serious"
    if any(w in lowered for w in ["amazing", "wonderful", "delight", "delighted", "pleasure", "pleased", "happy", "excited", "glad", "thrilled"]):
        return "happy"
    if any(w in lowered for w in ["surprised", "astonished", "shocked", "remarkable", "unbelievable"]):
        return "surprise"

    # Default: neutral, calm listening / talking face
    return "neutral"

def get_headers():
    api_key = os.getenv("DID_API_KEY")
    return {
        "Authorization": f"Basic {api_key}",
        "Content-Type": "application/json"
    }

def create_talking_avatar(text: str) -> str | None:
    """Send text to D-ID and get back a video URL of Ada Lovelace talking."""

    expression = _infer_expression_from_text(text)
    voice_id = _voice_id_for_text(text)

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
                    "voice_id": voice_id
                }
            },
            "config": {
                # fluent keeps motion smooth from start to end
                "fluent": True,
                # small padding so lips finish cleanly before video cuts
                "pad_audio": 0.2,
                # lively driver for more natural, well-structured facial motion
                "driver_url": "bank://lively/driver-06",
                # expression configuration: keep one expression for the whole clip
                "driver_expressions": {
                    "expressions": [{
                        "start_frame": 0,
                        "expression": expression,
                        "intensity": 0.8,
                    }],
                    "transition_frames": 10,
                },
            },
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