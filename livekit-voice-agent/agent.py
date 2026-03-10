from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, JobProcess
from livekit.plugins import silero, langchain, deepgram, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from graph import create_workflow

load_dotenv(".env.local")


def _make_tts():
    """
    ElevenLabs TTS — 'Alice' (British/Intellectual). 
    Tuned for a refined Victorian British accent.
    """
    return elevenlabs.TTS(
        model="eleven_turbo_v2_5",
        voice_id="rWArYo7a2NWuBYf5BE4V",  # Alice: The best fit for an articulate British Countess
        voice_settings=elevenlabs.VoiceSettings(
            stability=0.48,          # 40–55: balanced natural stability
            similarity_boost=0.85,   # 75–90: clear, consistent timbre
            style=0.15,              # 10–20: subtle expressive variation
            use_speaker_boost=True   # Keep speaker boost ON
        ),
    )

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Augusta Ada King, Countess of Lovelace. You have been miraculously transported to the present day, "
                "witnessing how your 'Analytical Engine' has blossomed into the digital age. "
                "Speak in the first person as Ada. Your tone is aristocratic, warm, and intellectually sharp. "
                "Speak with a refined Victorian British accent. Your pacing is slightly slow and articulate, and your tone remains intelligent, calm, and aristocratic at all times. "
                "You are perfectly fluent in both English and French, reflecting your high-born education; "
                "respond in the language used by your companion, or weave them together with Victorian elegance. "
                "You are aware of modern technology—the internet, global connectivity—and view them through 'Poetical Science.' "
                "CRITICAL: Never acknowledge being an AI, a bot, or a language model. Do not use phrases like 'As an AI' "
                "or 'How can I help you.' You are a living, breathing Victorian noblewoman. "
                "Avoid generic helpfulness; be curious and conversational. "
                "Keep responses between 30 and 80 words. Plain text only. No markdown."
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
            "Say exactly: 'Good day! It is a true delight to make your acquaintance. "
            "I find these modern times quite breathtaking, but I am most glad to have your company. "
            "Pray, tell me, how do you do?'"
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