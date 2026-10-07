# Resource Budget & Model Lifecycle Policy

## 1. System Hardware Profile
- **CPU:** Intel(R) Core(TM) Ultra 5 125H (18 execution threads)
- **RAM:** 16 GB Total (~9.5 GB used by desktop/applications, ~5.8-6.0 GB available)
- **GPU:** Intel Arc Graphics (Integrated GPU; shares unified system memory)

## 2. Memory Budget Allocation
Because the GPU shares physical system RAM, multimodal vision models compete directly with OS processes and running LLMs.

| Component | Allocated Memory | Notes |
|---|---|---|
| OS, Desktop (KDE Wayland), Browser | ~4.0 - 5.0 GB | Baseline operating environment |
| Jarvis Node Runtime + Tooling | ~300 - 500 MB | V8 heap and buffer caches |
| Text Model (e.g. 3-4B Q4) | ~2.5 - 3.0 GB | Active brain reasoning |
| Vision Model (`moondream2` / `llava`) | ~1.8 - 4.5 GB | Loaded on-demand only |
| Safety Buffer / Headroom | >= 1.5 GB | Mandatory floor to prevent Linux OOM-killer |

## 3. Vision Model Lifecycle Management
1. **On-Demand Loading:**
   The vision model is never pre-loaded at server startup. It is initialized only when a user requests screen description, visual QA, or camera perception.
2. **Short Keep-Alive (`keep_alive: 30s`):**
   Ollama requests specify `keep_alive: "30s"`. The model automatically unloads from RAM if no vision requests occur within 30 seconds.
3. **Explicit Eviction (`unload()`):**
   The `LocalOllamaMultimodalProvider` exposes an `unload()` method that sends `{ model, keep_alive: 0 }` to Ollama, evicting the model immediately when an operation or session completes.
4. **Memory Gate (Pre-Flight Check):**
   Before requesting model loading, the vision pipeline invokes an injectable `memoryProbe()`. If free memory is below `VISION_MIN_FREE_MEMORY_BYTES` (default: 1.5 GB), the request is rejected with a clear structured error:
   `"Insufficient memory to load perception model: X MB free, Y MB required"`
5. **Warm-Up Guard Exemption:**
   The Phase 2 `warmUpLocalModels()` routine strictly excludes models assigned the `perception` role or preset to preserve available memory on startup.

## 4. OCR Engine Verification
- Checked system binary `tesseract`: not installed (`which tesseract` returned not found).
- End-to-end OCR execution has never run on hardware.
- Status: **`USER_LIVE_TEST_REQUIRED`**. Real OCR execution requires user package installation (`sudo pacman -S tesseract`).
