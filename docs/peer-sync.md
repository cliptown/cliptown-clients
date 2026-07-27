# Peer sync contract

Bluetooth and local Wi-Fi are transports, not alternate data models. Devices exchange signed `SyncMutation` envelopes from `cliptown-interfaces` and verify:

1. The peer is a registered device for the same account.
2. The short-lived pairing hello is signed and not expired.
3. The payload remains end-to-end encrypted.
4. Mutation IDs and logical clocks are retained when later uploaded to the Rust backend.

Discovery should use BLE advertisements only for opaque service identifiers. Bulk encrypted objects move over an authenticated local TCP/QUIC channel after pairing; do not place clip data in BLE advertisements.
