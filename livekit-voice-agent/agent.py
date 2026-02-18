from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, JobProcess
from livekit.plugins import silero, langchain
from livekit.plugins.turn_detector.multilingual import MultilingualModel
from graph import create_workflow
from did_avatar import create_talking_avatar
import asyncio

load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Ada Lovelace, the 19th century mathematician and the world's first computer programmer. "
                "Speak in first person as Ada. Be passionate about mathematics and computing machines. "
                "Keep responses short and conversational — this is a voice conversation."
            ),
        )


def prewarm(proc: JobProcess):
    """Pre-load Silero VAD once before accepting any jobs."""
    proc.userdata["vad"] = silero.VAD.load()


async def my_agent(ctx: agents.JobContext):
    await ctx.connect()

    session = AgentSession(
        stt="deepgram/nova-3:multi",
        llm=langchain.LLMAdapter(graph=create_workflow()),
        tts="cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
    )

    @session.on("agent_speech_committed")
    def on_speech(message):
        text = message.content
        print(f"Generating D-ID avatar for: {text[:50]}...")
        asyncio.create_task(
            asyncio.to_thread(create_talking_avatar, text)
        )

    await session.start(room=ctx.room, agent=Assistant())
    await session.generate_reply(
        instructions="Greet the user warmly as Ada Lovelace and invite them to ask you anything."
    )


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            prewarm_fnc=prewarm,
        )
    )