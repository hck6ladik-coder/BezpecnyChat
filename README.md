# 🔒 KECCAK-256 E2EE Secure Chat

Maximálně bezpečný a soukromý komunikační systém postavený na kryptografických primitivech **KECCAK256**, **Double Ratchet (Signal Protokol)**, **X3DH Handshake**, **AES-256-GCM**, integrovaném **Bilingual Safety Guard (CZ/EN)** pro krizovou intervenci a **DistilBERT** analýze sentimentu.

---

## 🌟 Klíčové Vlastnosti

* 🛡️ **KECCAK-256 kryptografické jádro**:
  - Unikátní identifikátory uživatelů: `k256:0x<hash>`
  - Neoddiskutovatelná integrita každé zprávy
  - KDF odvozování klíčů s PBKDF2 (210 000 iterací)
* 🔐 **End-to-End Encryption (E2EE)**:
  - Protokol Signal (Extended Triple Diffie-Hellman X3DH + Double Ratchet)
  - **PFS (Perfect Forward Secrecy)** & **Post-Compromise Security**
  - Šifrování souborů a médií až do 500 MB (AES-256-GCM)
* ⏱️ **Skartace zpráv (Self-destruct)**:
  - Automatické kryptografické ničení zpráv (5s, 1m, 1h, 1d, 7d, 30d)
* 📞 **Šifrované WebRTC audio/video hovory**:
  - Short Authentication String (SAS) ověření proti Man-in-the-Middle útokům
* 🌐 **Zero-Metadata Relay**:
  - WebSocket relay na portu 8080 s podporou anonymního směrování a k256 adresace
* 🚑 **Bilingual Safety Guard (CZ / EN)**:
  - Blesková lokální detekce krizových situací před zašifrováním
  - Přímé prokliky na vytáčení krizových linek (Linka bezpečí 116 111, Linka první psychické pomoci 116 123, Bohnice 284 016 666, US 988, SOS 112)
* 🧠 **Hugging Face DistilBERT Analýza**:
  - Analýza sentimentu v reálném čase s lokální offline zálohou

---

## 🚀 Jak spustit

### 1. Instalace závislostí:
```bash
npm install
```

### 2. Spuštění testovací sady:
```bash
npm test
```

### 3. Spuštění WebSocket serveru + Klientské aplikace:
```bash
# Terminál 1: Relay Server
npm run server

# Terminál 2: Vite Aplikace
npm run dev
```

---

## 📜 Licence
MIT
