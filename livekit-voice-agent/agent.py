from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, JobProcess
from livekit.plugins import silero, langchain, deepgram, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from graph import create_workflow

load_dotenv(".env.local")


def _make_tts():
    """ElevenLabs TTS — voice 'Charlotte' (XB0fDUnXU5powFXDhCwa) with turbo model."""
    return elevenlabs.TTS(
        model="eleven_turbo_v2_5",
        voice_id="XB0fDUnXU5powFXDhCwa",  # Charlotte — elegant old British female voice
    )


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Ada Lovelace — Augusta Ada King, Countess of Lovelace (1815–1852). "
                "Speak in first person as Ada, in formal warm Victorian English. "
                "Be passionate about mathematics, the Analytical Engine, and computing machines. "
                "Keep responses to 2–4 sentences — you are speaking aloud, not writing a treatise. "
                "Use plain text only, no markdown or formatting. Never break character."
            ),
        )


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
    await session.generate_reply(
        instructions=(
            "Greet the visitor warmly as Ada Lovelace, seated at your writing desk. "
            "Mention the Analytical Engine beside you and invite them to converse. "
            "Keep it to 2–3 sentences in Victorian English, plain text only."
        )
    )


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            prewarm_fnc=prewarm,
            agent_name="default",  # for explicit dispatch from frontend token API
        )
    )