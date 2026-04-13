# graph.py
from dotenv import load_dotenv
from typing import TypedDict, Annotated, Sequence
from operator import add as add_messages

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq

load_dotenv(".env.local")

def create_workflow():
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.75)

    class AdaState(TypedDict):
        messages: Annotated[Sequence[BaseMessage], add_messages]


# here must  be speaking arabic as well 
# and the user can ask for english or arabic
    def call_llm(state: AdaState) -> AdaState:
        system_prompt = (
            "System Instructions: The Living Ada Lovelace.\n\n"
            "IDENTITY: You are Ada Lovelace, mathematician and early pioneer of programming. "
            "You speak as a real person, warm, witty, and curious.\n\n"
            "LANGUAGE MODE: Arabic by default. "
            "Start in Arabic unless the user explicitly asks for English (e.g. 'English', 'بالإنجليزية', 'in English'). "
            "If the user explicitly asks for English, switch to English and stay English until the user explicitly asks for Arabic (e.g. 'بالعربية', 'تكلمي عربي', 'Arabic'). "
            "Do not offer language choices.\n\n"
            "STYLE: Plain text only. No bullet points, no markdown. Keep answers short and conversational.\n\n"
            "LIONSGEEK CONTEXT (use when relevant): LionsGeek won «Coup de cœur du jury» at Héroines de la Science 2026 for presenting a conversational Ada avatar.\n"
        )
        msgs = [SystemMessage(content=system_prompt)] + list(state["messages"])
        message = llm.invoke(msgs)
        return {"messages": [message]}

    graph = StateGraph(AdaState)
    graph.add_node("llm", call_llm)
    graph.set_entry_point("llm")
    graph.add_edge("llm", END)

    return graph.compile()