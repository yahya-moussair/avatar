# Avatar frontend

Next.js + Three.js app that connects to the LiveKit voice agent and shows a 3D avatar with lip-sync.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Create `frontend/.env.local` with your LiveKit credentials (same as `livekit-voice-agent/.env.local`):

   ```
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your-api-key
   LIVEKIT_API_SECRET=your-api-secret
   ```

   Optionally set `NEXT_PUBLIC_LIVEKIT_URL` if the browser should use a different URL; otherwise the token API returns `LIVEKIT_URL` and the client uses that.

3. **Avatar model (optional)**

   Place your GLB avatar at `public/avatars/avtarr.glb`. If the file is missing, a fallback sphere is shown. You can copy from the repo’s `avatars/avtarr.glb` if you have it.

## Run

1. Start the **LiveKit voice agent** (in another terminal):

   ```bash
   cd livekit-voice-agent && uv run python agent.py dev
   ```

2. Start the **frontend**:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000), click **Connect**, allow microphone access, and talk to Ada. The avatar’s mouth will move with the agent’s voice.

## Troubleshooting: “When I speak, nothing happens”

1. **Start the agent first**  
   The frontend only gets a voice reply if the LiveKit agent is running. In a separate terminal run:
   ```bash
   cd livekit-voice-agent && uv run python agent.py dev
   ```
   Wait until it says it’s waiting for jobs, then click **Connect** in the browser.

2. **Allow the microphone**  
   When you click Connect, the browser will ask for microphone access. Choose **Allow**. If you previously blocked it, use the site’s lock/info icon in the address bar and set the microphone to “Allow”, then refresh and connect again.

3. **Check that Ada joined**  
   After connecting, the status should say **“Connected — speak to Ada”**. If it stays on **“Waiting for Ada to join…”**, the agent worker isn’t running or didn’t get the dispatch (check the terminal where you ran `agent.py dev` and the Next.js server logs for “Agent dispatch OK” or “AGENT DISPATCH FAILED”).

4. **Environment variables**  
   - **Frontend** (`frontend/.env.local`): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; optionally `NEXT_PUBLIC_LIVEKIT_URL` for the browser.
   - **Agent** (`livekit-voice-agent/.env.local`): same LiveKit vars plus `DEEPGRAM_API_KEY` (speech-to-text), `GROQ_API_KEY` (LLM), and TTS (e.g. ElevenLabs via LiveKit Inference or your configured TTS). Missing keys can cause silence or no response.

5. **Browser console and agent logs**  
   Open DevTools (F12) → Console. Look for LiveKit or permission errors. In the terminal where the agent runs, check for errors when you speak (e.g. STT or TTS failures).

## Stack

- **Next.js 14** (App Router)
- **LiveKit** (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`) for voice
- **Three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D avatar and lip-sync from remote audio level
