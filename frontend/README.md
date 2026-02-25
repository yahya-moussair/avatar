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

## Stack

- **Next.js 14** (App Router)
- **LiveKit** (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`) for voice
- **Three.js** via `@react-three/fiber` and `@react-three/drei` for the 3D avatar and lip-sync from remote audio level
