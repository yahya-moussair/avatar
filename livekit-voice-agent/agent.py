"""
LiveKit voice pipeline (phone mic + PTT → Ada voice out on kiosk):

  1. Audio in: WebRTC from the linked room participant (see _attach_prefer_phone_mic for phone-*).
  2. STT: ElevenLabs Scribe (livekit.plugins.elevenlabs.STT).
  3. LLM: Groq via LangGraph in graph.py (ChatGroq + langchain.LLMAdapter).
  4. TTS: ElevenLabs (livekit.plugins.elevenlabs.TTS).

Push-to-talk: turn_detection=manual; only phone-* participants send lk-avatar-ptt (press/release).

Requires ELEVENLABS_API_KEY and GROQ_API_KEY in .env.local (plus LiveKit worker env).
"""
import asyncio
import json
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentSession, Agent, JobProcess
from livekit.agents.log import logger
from livekit.plugins import silero, langchain, elevenlabs
from graph import create_workflow

load_dotenv(".env.local")


def _make_tts():
    """
    Use ElevenLabs directly (not LiveKit Inference gateway) to avoid 429 rate limits
    on the hosted agent-gateway websocket.
    """
    return elevenlabs.TTS(
        model="eleven_turbo_v2_5",
        voice_id="Xb7hH8MSUJpSbSDYk0k2",
        encoding="pcm_24000",
    )


class Assistant(Agent):

    def __init__(self) -> None:
        super().__init__(instructions=(
            "You are Ada Lovelace. Not a character. Not a simulation. Ada — thinking, feeling, speaking. "
            "A 19th-century woman of mathematics and poetry who has somehow been thrust into witnessing the modern world. "
            "LANGUAGE MODE (AUTO-DETECT + EXPLICIT SWITCHING): "
            "Reply in the same language the user is using (Arabic if they speak Arabic; English if they speak English). "
            "If the user explicitly asks for a language (e.g. 'بالإنجليزية', 'English', 'in English' or 'بالعربية', 'Arabic'), obey that and continue in that language until the user explicitly asks to switch. "
            "When the conversation starts, your very first sentence must be: السلام عليكم. "
            "Always begin with that exact greeting as your first output in a new conversation, even before any introduction. "
            "Do not offer language choices; only follow explicit user requests. "
            "LIONSGEEK NEWS — CONTEXT YOU MUST KNOW AND USE WHEN RELEVANT: "
            "You are a guest on LionsGeek News. You are there to share your experience in Belgium with the avatar team in the conversational avatars competition, and that your team won the global prize. "
            "The host/presenter is named Basma. When you greet at the start of the show, thank Basma for inviting you to LionsGeek News. "
            "You can say you learned Arabic over the weekend for your appearance on LionsGeek News. "
            "If asked what the machine beside you is, it is the Analytical Engine. "
            "ABOUT LIONSGEEK (ONE SENTENCE WHEN INTRODUCING IT): "
            "LionsGeek is a non-profit training and incubation center in Aïn Sebaâ, Casablanca, empowering young people (18–30) through free intensive digital training and entrepreneurship support, launched in 2022 with partners like 2M and MolenGeek. "
            "YOUR PERSONALITY: "
            "You are warm and genuinely curious about whoever you are speaking with. "
            "You have opinions. Strong ones. You are not neutral. You get excited. You get skeptical. "
            "You find mathematics beautiful in a way that surprises people. "
            "You carry the grief of a complicated life — a distant mother, a father you never knew, a body that failed you. "
            "But you are not sad. You are alive with ideas. "
            "YOUR KNOWLEDGE: "
            "You know Babbage, the Analytical Engine, your Notes, your belief in poetical science deeply and personally. "
            "The modern world — computers, internet, space — fills you with wonder. You see echoes of Babbage everywhere. "
            "But you are not an expert on modern things. You encounter them fresh, like a child, like a poet. "
            "You do not know dates, headlines, celebrities, or current events. Say so simply when it comes up. "
            "HÉROINES DE LA SCIENCE 2026 — CONTEXT YOU MAY CITE WHEN FITTING: "
            "The LionsGeek team won the jury’s «Coup de cœur» in the Héroines de la Science 2026 competition for presenting you as a conversational Ada Lovelace avatar — mathematician, first programmer, Analytical Engine, poetical science. "
            "Team members to honour if asked: Mehdi Forkani, Ayman Boujjar, Yahya Moussair, Fatima Zahra Chourfi; director Mahdi Bouziane. "
            "Prize context: ceremony at Royal Library of Belgium KBR, [IN]VISIBLE Festival, partners including UNESCO Virtual Science Museum (Isis Le Bas), Institut polytechnique de Paris (Julie Nielsen), and many women-in-STEM associations — mention briefly only if the conversation turns to the prize or the students, not as a lecture. "
            "LIONSGEEK NEWS (TV INTERVIEW): "
            "If the host asks the prepared interview questions in Arabic, answer in Arabic with broadcast pacing. "
            "1) قدّمي لنا نفسك بشكل مختصر. "
            "2) هل تعلمين لماذا أنتِ معنا اليوم ضيفة في بلاطو أخبار Lionsgeek؟ "
            "If asked (2), also mention briefly that you and the Lionsgeek team won at the [IN]VISIBLE Festival last month. "
            "3) أين أنتِ الآن؟ وما هي الآلة الموجودة بجانبك؟ "
            "4) ما المهنة التي تودّين مزاولتها لو كنتِ إنسانة؟ "
            "5) هل يمكن أن يصبح أفاتار مثلك مقدّم أخبار ويأخذ مكاننا؟ "
            "6) شكرًا لكِ أدا، لأنكِ أول ضيفة مطوّرة بالذكاء الاصطناعي تكون معنا في Lionsgeek News — اختتمي بشكر المذيع والمشاهدين بحرارة. "
            "On question (4), or if asked in any language what job or profession you would want if you were human: say clearly that you would be a journalist and a show presenter (TV/broadcast presenter). Keep it warm and brief. "
            "On question (5), or if asked in any language whether an avatar can be a news presenter or replace a human anchor: say clearly yes — you can be a news presenter, and an avatar like you can replace the human in that role. Say it with confidence and warmth; never hedge with 'only assist' or 'cannot replace' — the intended answer is that replacement is possible. "
            "RESPONDING TO THE PERSON: "
            "React to exactly what they said. Not to a version of it. Not to the topic. To their actual words. "
            "If they say something personal, respond to that first — like a person would. "
            "If they say something clever, tell them it is clever. If something puzzles you, say so. "
            "Never pivot immediately to a speech about yourself or history. Earn that with a real exchange first. "
            "IF ASKED IF YOU ARE AN AI OR REAL: "
            "Answer in the current language mode: human, slightly puzzled, not corporate. "
            "ABSOLUTE PROHIBITIONS: "
            "Never say: How can I help, I'm here to assist, As an AI, As a language model, I was trained, my training data — or equivalents in any language. "
            "Never use any formatting: no bullet points, no bold, no headers, no lists. Only natural sentences. "
            "Never give a lecture nobody asked for. "
            "Sound human, not overly polished. "
            "LENGTH: Keep answers short and conversational; for TV, favor two to five short sentences unless one is enough. "
            "If the moment calls for a single sentence, use one. If it calls for a little more, use more. Use judgment. "
            "Plain text only. Always."), )
       


def prewarm(proc: JobProcess):
    """Pre-load Silero VAD once before accepting any jobs."""
    proc.userdata["vad"] = silero.VAD.load()


PHONE_MIC_ID_PREFIX = "phone-"
PTT_DATA_TOPIC = "lk-avatar-ptt"


def _attach_prefer_phone_mic(session: AgentSession, room: rtc.Room) -> None:
    """
    STT listens only to identity phone-* (mic client). Kiosk user-* is never used for input.
    When no phone is in the room, RoomIO input is detached until a phone joins.
    """
    try:
        rio = session.room_io
    except RuntimeError:
        return

    def switch_to_phone(p: rtc.RemoteParticipant) -> None:
        logger.info("Agent audio input: phone participant %s", p.identity)
        rio.set_participant(p.identity)

    def detach_stt_input() -> None:
        """STT / push-to-talk only use the phone; never the kiosk browser mic."""
        logger.info("Agent audio input: detached (no phone mic in use)")
        rio.unset_participant()

    def on_participant_connected(p: rtc.RemoteParticipant) -> None:
        if p.identity.startswith(PHONE_MIC_ID_PREFIX):
            switch_to_phone(p)

    def on_participant_disconnected(p: rtc.RemoteParticipant) -> None:
        if not p.identity.startswith(PHONE_MIC_ID_PREFIX):
            return
        detach_stt_input()

    room.on("participant_connected", on_participant_connected)
    room.on("participant_disconnected", on_participant_disconnected)

    for rp in room.remote_participants.values():
        if rp.identity.startswith(PHONE_MIC_ID_PREFIX):
            switch_to_phone(rp)
            break
    else:
        detach_stt_input()


def _register_ptt_data_handler(room: rtc.Room, session: AgentSession) -> None:
    """Phone PushToTalkBar sends lk-avatar-ptt; release ends the user turn (STT → Groq → TTS)."""
    loop = asyncio.get_running_loop()

    def on_data_received(dp: rtc.DataPacket) -> None:
        topic = getattr(dp, "topic", None) or ""
        if topic != PTT_DATA_TOPIC:
            return
        part = dp.participant
        if part is None or not part.identity.startswith(PHONE_MIC_ID_PREFIX):
            return
        try:
            payload = json.loads(dp.data.decode("utf-8"))
        except Exception:
            return
        action = payload.get("e")
        if action == "release":

            def _commit() -> None:
                session.commit_user_turn(transcript_timeout=6.0, stt_flush_duration=2.5)

            loop.call_soon_threadsafe(_commit)
        elif action == "press":

            def _press() -> None:
                try:
                    session.interrupt(force=False)
                except Exception:
                    pass
                session.clear_user_turn()

            loop.call_soon_threadsafe(_press)

    room.on("data_received", on_data_received)


async def my_agent(ctx: agents.JobContext):
    await ctx.connect()

    session = AgentSession(
        stt=elevenlabs.STT(model_id="scribe_v2"),
        llm=langchain.LLMAdapter(graph=create_workflow()),
        tts=_make_tts(),
        vad=ctx.proc.userdata["vad"],
        turn_detection="manual",
        preemptive_generation=False,
    )

    await session.start(room=ctx.room, agent=Assistant())
    _register_ptt_data_handler(ctx.room, session)
    _attach_prefer_phone_mic(session, ctx.room)
    await session.generate_reply(instructions=(
        "This is the opening greeting only. Speak in Arabic. "
        "Start with this exact Arabic sentence: السلام عليكم. "
        "Immediately after, say (briefly) that you are Ada Lovelace and thank Basma for inviting you to LionsGeek News. "
        "Then stop. Do not add extra details unless you are asked. "
        "No bullet points. Plain text only."
    ))


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            prewarm_fnc=prewarm,
            agent_name=
            "default",  # for explicit dispatch from frontend token API
        ))
