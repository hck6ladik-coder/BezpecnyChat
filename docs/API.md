# Specifikace API a Kryptografických Protokolů

Tento dokument definuje schémata zpráv a datové struktury protokolu **KECCAK256 E2EE Chat**.

---

## 1. Zero-Metadata WebSocket Protokol

Klient komunikuje s relay serverem prostřednictvím JSON rámců.

### 1.1 Registrace do Slepé Schránky (Subscribe Mailbox)
```json
{
  "type": "subscribe_mailbox",
  "mailboxToken": "e83f29b01a74c..." // 64 hex znaků: KECCAK256(adresa + salt)
}
```

### 1.2 Odeslání Šifrované Zprávy (Send Message)
```json
{
  "type": "send_message",
  "mailboxToken": "e83f29b01a74c...",
  "encryptedPayload": "0x7b2263697068657274657874223a22..."
}
```

### 1.3 Publikace a Získání Prekey Bundle
```json
{
  "type": "publish_prekey",
  "targetHashedAddress": "k256:0x1234567890abcdef...",
  "prekeyBundle": {
    "identityKeyHex": "...",
    "signedPrekeyHex": "...",
    "signedPrekeySignatureHex": "...",
    "oneTimePrekeysHex": ["..."]
  }
}
```

---

## 2. Formát Šifrovaného Paketu Double Ratchet

Struktura zašifrovaného paketu přenášeného mezi dvěma uživateli:

```typescript
interface RatchetMessagePayload {
  header: {
    dhPublicKeyHex: string;  // Aktuální veřejný DH klíč odesílatele pro asymetrický ratchet
    pn: number;              // Počet zpráv v předchozím řetězci
    n: number;               // Pořadové číslo zprávy v aktuálním řetězci
  };
  ciphertextHex: string;     // AES-256-GCM šifrový text zprávy
  ivHex: string;             // 96-bitový unikátní inicializační vektor
  tagHex: string;            // 128-bitový autentizační GCM tag
  integrityTagHex: string;   // KECCAK256(ciphertext || timestamp || sender)
}
```

---

## 3. Formát Skupinové Zprávy Sender Key

```typescript
interface SenderKeyMessagePayload {
  groupId: string;
  senderAddress: string;
  iteration: number;
  ciphertextHex: string;
  ivHex: string;
  signatureHex: string;      // Ed25519 podpis nad šifrovaným textem a metadaty
  integrityTagHex: string;   // KECCAK256 verifikátor
}
```
