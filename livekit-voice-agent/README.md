# LiveKit voice agent (Ada Lovelace)

Ada is configured for **English and French**: Deepgram `nova-3` with `language="multi"` for recognition, Eleven Turbo v2.5 for TTS (no fixed locale), and prompts in `agent.py` / `graph.py` that require idiomatic French when the user speaks French.

## Environment (.env.local)

| Variable | Purpose |
|----------|--------|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit connection |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `GROQ_API_KEY` | **LLM only** (Groq, used in graph.py) |
| **TTS (pick one)** | So you hear Ada. |
| `OPENAI_API_KEY` | Use OpenAI TTS (recommended if you hear nothing; no credits). |
| `CARTESIA_API_KEY` | Use Cartesia TTS. Needs [credits](https://play.cartesia.ai/subscription); 402 = out of credits. |

If `OPENAI_API_KEY` is set, TTS uses OpenAI (Groq is still used only for the LLM). If not, TTS uses Cartesia.

## Run

```bash
uv run python agent.py dev
```
