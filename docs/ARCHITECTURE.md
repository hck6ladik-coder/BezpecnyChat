# Architektura a Bezpečnostní Model KECCAK256 E2EE Chat

Tento dokument detailně popisuje architekturu, kryptografické primitivy a komunikační toky sociální chatovací aplikace s maximálním zabezpečením a ochranou soukromí.

---

## 1. Klíčová Kryptografická Primitiva

Aplikace striktně využívá funkci **KECCAK256** (původní Keccak specifikace dle NIST SHA-3 standardu s kapacitou $c=512$ a šířkou stavu $b=1600$) jako základní kryptografický stavební kámen:

1. **Integrita a Autentizace zpráv**:
   $$\text{Tag} = \text{KECCAK256}(\text{Ciphertext} \parallel \text{Timestamp} \parallel \text{SenderAddress})$$
2. **Derivace Klíčů (KDF)**:
   - **PBKDF2-KECCAK256**: 210 000 iterací pro bezpečné odemknutí lokálního trezoru z hesla.
   - **HKDF-KECCAK256**: Pro rozpad master klíčů na `VaultKey` (AES-256-GCM), `AuthKey` a `BackupKey`.
   - **Symmetric Ratchet KDF**: Pro posun Double Ratchet řetězce zpráv:
     $$\text{MessageKey} = \text{KECCAK256}(\text{ChainKey} \parallel \text{0x01})$$
     $$\text{NextChainKey} = \text{KECCAK256}(\text{ChainKey} \parallel \text{0x02})$$
3. **Anonymní Uživatelské Adresy**:
   $$\text{Address} = \text{k256:0x} \parallel \text{KECCAK256}(\text{IdentityPublicKey})[12..31]$$
4. **Slepé Schránky (Zero-Metadata Mailboxes)**:
   $$\text{MailboxToken} = \text{KECCAK256}(\text{RecipientAddress} \parallel \text{EpochSalt})$$

---

## 2. Protokol Koncového Šifrování (E2EE)

### 2.1 X3DH (Extended Triple Diffie-Hellman) Handshake
Před navázáním komunikace publikuje příjemce Bob do distribuovaného registru svůj Prekey Bundle:
- **IK (Identity Key)**: Dlouhodobý X25519 klíč.
- **SPK (Signed Prekey)**: Střednědobý X25519 klíč podepsaný Ed25519 podpisovým klíčem.
- **OPK (One-Time Prekeys)**: Sada jednorázových klíčů.

Alice provede 4 Diffie-Hellman operace:
$$DH_1 = \text{ECDH}(IK_A, SPK_B)$$
$$DH_2 = \text{ECDH}(EK_A, IK_B)$$
$$DH_3 = \text{ECDH}(EK_A, SPK_B)$$
$$DH_4 = \text{ECDH}(EK_A, OPK_B)$$

Sdílený počáteční klíč je odvozen:
$$\text{SK} = \text{HKDF-KECCAK256}(DH_1 \parallel DH_2 \parallel DH_3 \parallel DH_4, \text{salt}, \text{"X3DH-KECCAK"})$$

### 2.2 Double Ratchet (PFS + PCS)
Každá odeslaná i přijatá zpráva posouvá symetrický ratchet. Při každém obratu konverzace (Alice $\rightarrow$ Bob $\rightarrow$ Alice) proběhne nový asymetrický Diffie-Hellman ratchet krok, který garantuje:
- **Perfect Forward Secrecy (PFS)**: Kompromitace současného klíče neumožní dešifrovat minulé zprávy.
- **Post-Compromise Security (PCS)**: Systém se po kompromitaci zařízení automaticky "uzdraví" po dalším DH kroku.

---

## 3. Skupinové Chaty: Protokol Sender Key
Pro skupiny až do 2 000 uživatelů:
- Každý účastník vygeneruje svůj **Sender Key** (řetězec klíčů).
- Tento klíč zašifruje přes přímé dvoustranné Double Ratchet kanály všem členům skupiny.
- Následné skupinové zprávy šifruje odesílatel v čase $O(1)$ a podepisuje Ed25519 podpisem.

---

## 4. WebRTC Šifrované Audio/Video Hovory
- Zabezpečeno přes DTLS-SRTP.
- **SAS (Short Authentication String)**: Obě strany si hlasově ověří 6místný kontrolní kód odvozený pomocí KECCAK256 ze společných parametrů spojení:
  $$\text{SAS} = \text{KECCAK256}(\text{CallID} \parallel \text{AliceAddr} \parallel \text{BobAddr})[0..3]$$

---

## 5. Zero-Metadata Relay Server
- Server **neukládá** žádné IP adresy, metadata zpráv, časy ani uživatelské vazby.
- Směrování probíhá na základě slepých schránek (`MailboxToken`), kde server nedokáže určit identitu odesílatele ani příjemce.
- Možnost provozu jako **Tor Hidden Service (.onion)**.
