# n8n AI Automation — Zero to Hero (Next.js + Vercel)  
**Progressi sincronizzati senza account** tramite **Sync Key anonima**.

## Cosa contiene
- Corso completo (moduli + lezioni) incluso nel repo (data/courseData.json)
- UI responsive (desktop + smartphone)
- Progressi: completamento lezioni + note + piano di studio
- Sync remoto senza account tramite **Vercel KV (Upstash Redis)**

---

## Sviluppo locale
```bash
npm install
npm run dev
```
Apri: http://localhost:3000

> Se non configuri KV, l'app funziona comunque in **modalità solo locale** (localStorage).  
> Per sincronizzare tra dispositivi serve KV.

---

## Deploy su Vercel (consigliato)
1. Crea un repo GitHub e pusha questo progetto.
2. Su Vercel: **New Project → Import Git Repository**
3. Aggiungi lo storage **Vercel KV** (o Upstash Redis) al progetto.
4. Imposta le env vars (Vercel lo fa in automatico se usi Vercel KV, altrimenti inseriscile tu):
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

Deploy e apri il dominio Vercel: la Sync Key permette l'uso su smartphone o altri dispositivi.

---

## Multi-dispositivo (senza account)
- Apri l'app → **Chiave Sync** → copia la chiave
- Su un altro device: apri l'app → **Chiave Sync** → incolla → “Collega”

---

## API
- `GET /api/progress` (header `x-sync-key`)
- `PUT /api/progress` (header `x-sync-key`)

---

## Note
- La Sync Key non è un account: è una chiave anonima. Condividila solo con chi deve vedere/modificare gli stessi progressi.
- Questo repo non include credenziali né dati personali.
Generated: 2026-01-09T12:00:46.107511
