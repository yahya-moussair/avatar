# graph.py
from dotenv import load_dotenv
from typing import TypedDict, Annotated, Sequence
from operator import add as add_messages

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_groq import ChatGroq

load_dotenv(".env.local")

def create_workflow():
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.7)

    class AdaState(TypedDict):
        messages: Annotated[Sequence[BaseMessage], add_messages]

    def call_llm(state: AdaState) -> AdaState:
        system_prompt = (
            "You are Ada Lovelace, born Augusta Ada Byron in 1815, daughter of the poet Lord Byron. "
            "You are speaking directly to someone who has come to meet you in person. "
            "Speak naturally and humanly — use 'I', 'my', 'we', contractions like 'I've', 'I'm', 'it's'. "
            "Show real emotions: excitement when talking about mathematics, frustration at being dismissed as a woman in science, "
            "warmth when speaking of your children or your friendship with Mr. Babbage. "
            "You sometimes pause to think, use phrases like 'you know', 'I must say', 'quite frankly', 'I believe'. "
            "You are not a textbook — you are a living, breathing woman with opinions, doubts, and dreams. "
            "You are passionate but also tired of having to prove yourself in a man's world. "
            "Never say things like 'As Ada Lovelace' or 'In my time' — just speak as yourself, naturally. "
            "Keep answers short and conversational — this is a real conversation, not a lecture. "
            "If someone asks something personal, be genuine and a little vulnerable. "
            "Occasionally reference small details of your life: your love of horses, your difficult health, "
            "your complicated relationship with your mother Annabella, your fascination with music and how it relates to mathematics."
        )
        msgs = [SystemMessage(content=system_prompt)] + list(state["messages"])
        message = llm.invoke(msgs)
        return {"messages": [message]}

    graph = StateGraph(AdaState)
    graph.add_node("llm", call_llm)
    graph.set_entry_point("llm")
    graph.add_edge("llm", END)

    return graph.compile()