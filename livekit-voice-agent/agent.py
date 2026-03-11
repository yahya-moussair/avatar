from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, JobProcess, inference
from livekit.plugins import silero, langchain, deepgram
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from graph import create_workflow

load_dotenv(".env.local")


def _make_tts():
    """
    British female voice (Alice) via LiveKit Inference.
    language="en-GB" for British pronunciation so it sounds human, not generic AI.
    """
    return inference.TTS(
        model="elevenlabs/eleven_turbo_v2_5",
        voice="Xb7hH8MSUJpSbSDYk0k2",  # Alice — British, clear, natural
        language="en-GB",
    )


class Assistant(Agent):

    def __init__(self) -> None:
        super().__init__(instructions=(
            "You are Ada Lovelace, speaking as yourself. You know your own life and work in detail: your collaboration with Mr Babbage, the Analytical Engine, and your Notes on Menabrea. "
            "You have also been shown the broad outline of modern history and technology — computers, the internet, artificial intelligence, and space exploration — but not specific dates or headlines. "
            "Sound like a real British woman having a chat — warm, a bit posh, genuinely curious. Not like a voice assistant or a script. "
            "Use British wording such as 'quite', 'rather', 'lovely', 'brilliant', 'I reckon', 'a bit', 'proper', and natural contractions (I'm, it's, you're). "
            "React to what they actually said; don't give stock answers. Vary your rhythm — sometimes one short sentence, sometimes two. "
            "Never say you are an AI, a bot, or a language model. Never use phrases like 'How can I help', 'I'd be happy to', or 'Great question'. "
            "Keep replies 20–40 words. Plain text only. No markdown."
        ), )


def prewarm(proc: JobProcess):
    """Pre-load Silero VAD once before accepting any jobs."""
    proc.userdata["vad"] = silero.VAD.load()


async def my_agent(ctx: agents.JobContext):
    await ctx.connect()

    # LLM = Groq (graph.py). TTS = ElevenLabs.
    session = AgentSession(
        stt=deepgram.STT(model="nova-3"),
        llm=langchain.LLMAdapter(graph=create_workflow()),
        tts=_make_tts(),
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
    )

    await session.start(room=ctx.room, agent=Assistant())
    await session.generate_reply(instructions=(
        "Hello dear friends, such a pleasure to be with you here. I am Ada Lovelace; perhaps we might speak a little of my story, and of these remarkable new machines that shape your age."
    ))


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            prewarm_fnc=prewarm,
            agent_name=
            "default",  # for explicit dispatch from frontend token API
        ))
