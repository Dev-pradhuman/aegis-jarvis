# Architectural Decision Record: Local Vision Pipeline

## Context
Phase 4 introduces local, private vision capabilities to Jarvis, allowing the system to understand the user's screen and camera snapshot. Hard rules dictate zero cloud processing for images (they must be routed to a local model) and strict device contention management.

## Inventory of Existing Code
- `server/screenUnderstanding.js`: Existing foundation for extracting active window/screen details.
- `server/cameraUnderstanding.js`: Foundation for camera integration.
- Tool schemas: `camera.*` and `screen.*` tools.
- Capture mechanism: KDE Wayland KWin screen capture paths via DBus.
- Hand tracking: The browser client currently uses hand tracking (`WorkspaceViews.jsx` has gesture state) which could lock the camera device on the OS side.
- Model role: The `perception` role is already defined in the orchestration topology to handle multimodal inputs.

## Hardware Constraints
Hardware probe results:
- **CPU**: Intel(R) Core(TM) Ultra 5 125H (18 cores)
- **RAM**: 16 GB total (~5.8 GB available)
- **GPU**: Intel Arc Graphics (Integrated GPU, shares system memory)

With no dedicated VRAM and limited available RAM, large multi-modal models (e.g. LLaVA 13B, 34B) are ruled out. 

## Model Options
1. **Moondream2 (via Ollama)**: 
   - Size: ~1.7 GB (q4/fp16).
   - License: Apache 2.0 (permissive).
   - Speed: Extremely fast on iGPUs and CPUs.
   - Capability: High text and object recognition efficiency for its size.
2. **LLaVA 7B (via Ollama)**: 
   - Size: ~4.7 GB (q4_0).
   - License: Apache 2.0.
   - Speed: Slow to moderate on this Intel iGPU. High RAM usage.

**Recommendation:** We strongly recommend **Moondream2** to keep the system responsive, avoid OOMs on 16GB shared RAM, and maintain fast end-to-end perception latency.

## Capture Paths & Arbitration
- **Screen Capture**: Use the existing KDE portal / DBus approach for Wayland screenshots. We will implement configurable blocklists (e.g., password managers) to silently reject sensitive captures.
- **Camera Capture**: Use OS-level video capture (`v4l2` / `ffmpeg` or similar `fs` read).
- **Contention**: The browser's hand tracker (WebRTC/getUserMedia) and the server's snapshot tool will fight for `/dev/video0`.
  - **Decision**: The browser will be the primary holder of the camera stream. The server tool will fail gracefully if locked. Alternatively, the browser can pause its tracks to yield to the server. For simplicity, we will emit clear error messages ("Camera in use by gesture tracking") if a lock fails.

## Request for Approval
USER_PROMPT_REQUIRED: Do you approve downloading `moondream2` (~1.7 GB) via Ollama for the perception engine?
