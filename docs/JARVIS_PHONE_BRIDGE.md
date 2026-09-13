# JARVIS Phone Bridge

`server/phoneBridge.js` implements the PC protocol boundary. It is not a mobile application and no phone is currently paired.

## Protocol

1. An authenticated local operator starts a five-minute pairing session.
2. JARVIS generates a 192-bit one-time secret, stores only its HMAC in durable state, and retains plaintext only in process memory until completion.
3. The companion proves possession with HMAC over pairing ID, device ID, and a client nonce.
4. Device credentials are returned inside an AES-256-GCM envelope derived from the one-time secret.
5. Subsequent event/poll requests use AES-256-GCM payloads plus HMAC-SHA256 over purpose, device, timestamp, nonce, and ciphertext. Two-minute clock bounds and persisted nonce receipts reject replay.
6. Each device has explicit capability grants. `phone.command` requires canonical approval and queues work; it reports `QUEUED_FOR_DEVICE`, never completed device action. Companion acknowledgement updates the durable command.

Canonical tools: `phone.status`, `phone.devices`, `phone.command`. HTTP protocol endpoints: pairing start/complete, encrypted command poll, encrypted events.

## Required setup

Set a strong `PHONE_BRIDGE_MASTER_KEY`, `JARVIS_AUTH_TOKEN`, `JARVIS_HOST`, and `JARVIS_PHONE_BRIDGE_ALLOW_LAN=1`; permit the chosen port on the private firewall profile; install/build a companion implementing this protocol. The server otherwise remains loopback-only. Device revocation UI/API and the mobile companion are not implemented yet, so daily phone control is configuration/integration incomplete.
