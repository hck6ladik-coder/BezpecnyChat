# Příručka pro Nasazení a Provoz (Deployment Guide)

Tento návod popisuje postup nasazení a spuštění Zero-Metadata WebSocket Relay Serveru a klientské aplikace s podporou sítě Tor.

---

## 1. Lokální Spuštění Vývojového Prostředí

### Požadavky
- Node.js verze 18+ nebo 20+
- npm nebo pnpm

### Instalace závislostí a spuštění
Přejděte do dedikované složky projektu `keccak-secure-chat`:

```bash
cd keccak-secure-chat
npm install
```

Spuštění jednotkových kryptografických testů:
```bash
npm test
```

Spuštění klientského rozhraní (Vite dev server):
```bash
npm run dev
```
Aplikace běží na adrese: `http://localhost:5174`

Spuštění Zero-Metadata Relay Serveru:
```bash
npm run server
```
Relay server naslouchá na portu: `8080`

---

## 2. Produkční Nasazení přes Docker

Vytvořte `Dockerfile` pro relay server:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server ./server
COPY tsconfig.json ./
CMD ["npm", "run", "server"]
```

Spuštění kontejneru:
```bash
docker build -t keccak-relay .
docker run -d -p 8080:8080 --name keccak-chat-relay keccak-relay
```

---

## 3. Konfigurace Tor Hidden Service (.onion)

1. Nainstalujte Tor daemon na server:
   ```bash
   sudo apt update && sudo apt install tor -y
   ```
2. Zkopírujte konfigurační soubor z `server/tor-config/torrc` do `/etc/tor/torrc`.
3. Restartujte službu Tor:
   ```bash
   sudo systemctl restart tor
   ```
4. Získejte vaši unikátní `.onion` adresu:
   ```bash
   sudo cat /var/lib/tor/keccak_chat_service/hostname
   ```
5. Klienti se nyní mohou připojit přímo přes Tor síť bez odhalení IP adres.
