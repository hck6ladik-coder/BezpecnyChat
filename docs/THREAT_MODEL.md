# Zpráva o Analýze Hrozeb a Bezpečnostním Designu

Toto je autorská analýza hrozeb a bezpečnostního designu, nikoli nezávislý externí audit třetí stranou.

Tento dokument shrnuje bezpečnostní analýzu a ověření kryptografických invariantů aplikace **KECCAK256 E2EE Chat**.

---

## 1. Analýza Hrozeb (Threat Model)

| Typ Útočníka | Možnosti Útočníka | Ochranný Mechanismus Aplikace |
| :--- | :--- | :--- |
| **Aktivní Man-in-the-Middle (MitM)** | Odposlech a modifikace síťového provozu | X3DH s podepsanými prekeys + 60místná bezpečnostní čísla (Safety Numbers) s 5 200 koly KECCAK256. |
| **Kompromitovaný Server Relay** | Přístup ke všem reléovým zprávám | Zero-Metadata architektura: server vidí pouze slepé mailbox tokeny a AES-256-GCM šifrovaná data bez přístupu ke klíčům. |
| **Fyzická Ztráta Zařízení** | Přístup k lokálnímu úložišti (IndexedDB) | Veškerá data jsou šifrována klíčem z PBKDF2-KECCAK256 (210 000 iterací). Bez hesla a 2FA nelze trezor dešifrovat. |
| **Kompromitace Jednoho Klíče** | Získání dočasného klíče z RAM | Double Ratchet okamžitě ničí použité klíče (PFS). Nový DH ratchet krok eliminuje přístup k budoucím zprávám (PCS). |
| **Časové a Postranní Kanály** | Měření času porovnávání hashů/tagů | Konstantní čas porovnávání bytových polí (`subtle.timingSafeEqual` invarianty). |
| **Kvantový Počítač (Budoucí hrozba)** | Útok Shorovým algoritmem na ECC | Architektura podporuje hybridní post-quantum KEM (ML-KEM-768 / Kyber) zapouzdřený do X3DH derivace. |

---

## 2. Kryptografické Invarianty

1. **Unikátnost IV a Klíčů**:
   - Každá zpráva má jedinečný 96-bitový kryptograficky náhodný IV a unikátní odvozený Message Key.
   - Opakování stejného páru (Klíč, IV) v AES-GCM je matematicky vyloučeno.
2. **Integrita Vstupů (KECCAK256)**:
   - Jakýkoliv zásah do šifrového textu nebo metadat selže při ověření Keccak tagu ještě před zpracováním dešifrování.
3. **Samosmazání Zpráv**:
   - Skartace probíhá kryptografickým přepisem a vymazáním příslušných klíčů a zpráv z lokální paměti i trezoru.

---

## 3. Výsledky Testování

Automatizovaná testovací sada v [`src/test/crypto.test.ts`](file:///c:/Users/Node.dev/Desktop/1/keccak-secure-chat/src/test/crypto.test.ts) pokrývá:
- [x] Standardní testovací vektory KECCAK256 dle specifikace NIST.
- [x] PBKDF2 a HKDF klíčové derivace.
- [x] X3DH 4cestné Diffie-Hellman handshakes.
- [x] Double Ratchet Alice $\leftrightarrow$ Bob plný cyklus s obraty konverzace.
- [x] Sender Key skupinové vysílání pro multi-uživatelské kanály.
- [x] Oboustranná symetrie 60místných bezpečnostních čísel.
- [x] 2FA TOTP časové okno a jednorázové záchranné kódy.
