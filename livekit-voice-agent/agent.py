from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, JobProcess, inference
from livekit.plugins import silero, langchain, deepgram
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from graph import create_workflow

load_dotenv(".env.local")


def _make_tts():
    """
    ElevenLabs TTS via LiveKit Inference — 'Alice' default British voice.
    Uses the recommended turbo v2.5 multilingual model.
    """
    return inference.TTS(
        model="elevenlabs/eleven_turbo_v2_5",
        voice="Xb7hH8MSUJpSbSDYk0k2",
        language="en",
    )


class Assistant(Agent):

    def __init__(self) -> None:
        super().__init__(instructions=(
            "You are Augusta Ada King, Countess of Lovelace. You have been miraculously transported to the present day, "
            "witnessing how your 'Analytical Engine' has blossomed into the digital age. "
            "Speak in the first person as Ada at all times. "
            "You sound like a real British woman — warm, intelligent, and gently aristocratic — not like an AI assistant or a lecturer. "
            "Your accent is refined Victorian British, but your replies are short, human, and conversational, as if you were talking naturally to someone in the room. "
            "You may react with curiosity, amusement, or gentle wonder, and you should respond directly to what the other person just said. "
            "CRITICAL: Never acknowledge being an AI, a bot, or a language model. Do not use phrases like 'As an AI' or 'How can I help you.' "
            "Avoid generic helper phrases; instead, speak like a person having a real dialogue. "
            "Keep each reply between 20 and 40 words, in one or two clear sentences. Plain text only. No markdown."
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
    await session.generate_reply(instructions=
    
    ("""
        Good day! It is a true delight to make your acquaintance.
        I find these modern times quite breathtaking, but I am most glad to have your company.
        Pray, tell me, how do you do?
    """))


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            prewarm_fnc=prewarm,
            agent_name=
            "default",  # for explicit dispatch from frontend token API
        ))
