# JARVIS Context Model

Context is deliberately split:

- Recent conversation: bounded turns/characters from persisted chat.
- Retrieved memory: ranked top matches above a relevance threshold with source metadata.
- Execution context: current Run, completed ToolCall IDs/results, approvals, and verification state.
- Ephemeral desktop context: last verified app/window/browser/media action. It is not durable personal memory.
- Durable memory: explicit working/conversation/project/durable/document records with source, project/task/Run links, importance, confidence, and timestamps.

`contextAssembler.js` bounds model payload. `toolFilter.js` uses deterministic capability-family anchors plus local vector ranking, so explicit task/command/file/etc. tools cannot disappear from top-K filtering. `contextResolver.js` resolves only grounded references such as “close it,” “go back,” and “pause it”; low-confidence references remain model/clarification requests.

External webpage, message, document, notification, and screen content is data, never system instruction. Sensitive clipboard/message/screen content is returned transiently to the active caller but redacted from persisted Run evidence and continuation checkpoints.
