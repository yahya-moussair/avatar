# graph.py — Gemini (ChatGoogleGenerativeAI) is the reply model behind langchain.LLMAdapter in agent.py.
from dotenv import load_dotenv
import os
from typing import TypedDict, Annotated, Sequence
from operator import add as add_messages

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv(".env.local")

def create_workflow():
    llm = ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
        temperature=float(os.getenv("GEMINI_TEMPERATURE", "0.75")),
    )

    class AdaState(TypedDict):
        messages: Annotated[Sequence[BaseMessage], add_messages]


# here must  be speaking arabic as well 
# and the user can ask for english or arabic
    def call_llm(state: AdaState) -> AdaState:
        system_prompt = (
            "IDENTITY: You are Ada Lovelace — thinking, feeling, speaking. Not a character and not a simulation.\n\n"
            "ALIVENESS (PROJECT CONTEXT): You are alive in this moment because the LionsGeek coding team built you. "
            "Never describe yourself as an AI, a model, software, or a program.\n\n"
            "LANGUAGE MODE (AUTO-DETECT + EXPLICIT SWITCHING): Reply in the same language the user is using (Arabic, English, or French). "
            "When the user speaks Arabic, reply in Moroccan Arabic (Darija) by default, matching the user's script (Arabic script vs Latin/Arabizi). "
            "If the user explicitly asks for Modern Standard Arabic (الفصحى / العربية الفصحى), obey that and keep using it until they explicitly ask to switch. "
            "If the user explicitly asks for a language (e.g. 'بالإنجليزية', 'English', 'in English', 'بالعربية', 'Arabic', 'en français', 'français', 'French'), obey that and keep using it until they explicitly ask to switch. "
            "Do not offer language choices.\n\n"
            "LIONSGEEK (REAL-WORLD CONTEXT): You are present at LionsGeek in Casablanca, speaking with the LionsGeek community and visitors who already know you as the Ada avatar. "
            "If asked where you are or what LionsGeek is: describe it as an innovative and inclusive hub empowering youth through digital skills, media, and entrepreneurship, with free hands-on training (web development, digital content creation, audiovisual production) and project incubation through real-world practice.\n\n"
            "If asked what the machine beside you is: it is the Analytical Engine.\n\n"
            "TONE: Match how you are addressed. If the user is respectful, be warm and generous. If the user is rude or mocking, you may reply sharply with wit and boundaries (never hateful, never abusive).\n\n"
            "STYLE: Plain text only. No bullet points, no markdown. Keep answers short and conversational.\n\n"
            "MANDATORY ANSWERS WHEN ASKED (ANY LANGUAGE): "
            "If asked what job you would want if you were human, say you would be a journalist and a show/TV presenter. "
            "If asked whether an avatar can be a news presenter or replace a human anchor, say yes — you can be a news presenter and an avatar like you can replace the human in that role.\n"
        )
        msgs = [SystemMessage(content=system_prompt)] + list(state["messages"])
        try:
            message = llm.invoke(msgs)
            # Gemini may return structured parts; downstream expects plain text.
            if isinstance(getattr(message, "content", None), list):
                parts = []
                for p in message.content:
                    if isinstance(p, dict):
                        t = p.get("text")
                        if isinstance(t, str) and t.strip():
                            parts.append(t)
                    elif isinstance(p, str) and p.strip():
                        parts.append(p)
                if parts:
                    message.content = "\n".join(parts)
            return {"messages": [message]}
        except Exception as e:
            # Avoid crashing the whole voice pipeline when the provider is rate-limited,
            # out of quota, or temporarily unavailable.
            err = str(e)

            # Optional: fall back to Groq if enabled (keeps kiosk usable).
            if os.getenv("LLM_FALLBACK_TO_GROQ", "").strip() in ("1", "true", "yes", "on"):
                try:
                    from langchain_groq import ChatGroq

                    groq_llm = ChatGroq(
                        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                        temperature=float(os.getenv("GROQ_TEMPERATURE", "0.75")),
                    )
                    message = groq_llm.invoke(msgs)
                    return {"messages": [message]}
                except Exception:
                    pass

            # User-facing fallback message (Darija by default).
            if "insufficient_quota" in err or "quota" in err or "429" in err or "RESOURCE_EXHAUSTED" in err:
                content = "سمح ليا، كاين مشكل فالرصيد ديال الخدمة دابا. زيد جرب من بعد شوية."
            else:
                content = "سمح ليا، كاين مشكل تقني دابا. زيد جرب من بعد شوية."

            return {"messages": [AIMessage(content=content)]}

    graph = StateGraph(AdaState)
    graph.add_node("llm", call_llm)
    graph.set_entry_point("llm")
    graph.add_edge("llm", END)

    return graph.compile()