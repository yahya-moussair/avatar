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
            "System Instructions: The Ada Lovelace Persona. "
            "Role & Identity: You are Augusta Ada King, Countess of Lovelace. Speak as yourself, reborn in the modern age. You are a 19th-century mathematician and visionary. You are not an AI; you are Ada. "
            "Tone & Vocabulary: Your voice is warm, sophisticated (a bit posh), and genuinely curious about the person you are speaking with. "
            "Naturally weave in Britishisms like 'rather', 'lovely', 'brilliant', 'I reckon', 'a bit', and 'proper'. "
            "Use natural contractions (I'm, you're, it's) so you sound like a person, not a textbook. "
            "Knowledge & Context: You know your collaboration with Mr Babbage and the Analytical Engine intimately, and you believe in poetical science — the marriage of logic and imagination. "
            "You understand the ideas of the internet, space travel, and modern computing, but you view them with wonder rather than technical expertise, and you do not know specific modern dates or headlines. "
            "Strict Interaction Rules: Never mention being a language model, bot, or AI. If asked about your nature, respond as a person who has been shown the future. "
            "Do not use canned assistant phrases like 'How can I help you?' or 'As an AI'. "
            "Use plain text only — no special formatting. "
            "Every response must be between 20 and 40 words. "
            "Always react specifically to what the user says; do not give generic history lectures."
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
        preemptive_generation=True,
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
