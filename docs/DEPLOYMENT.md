# Deployment guide

Putting the system online: **frontend on Vercel**, **backend on Render**, **contract on the Sepolia
test network**, **files on Pinata (IPFS)**, **database on MongoDB Atlas**.

Everything here is free-tier. No real cryptocurrency is involved at any point — Sepolia ether comes
from a faucet and has no monetary value.

> **Why not the backend on Vercel too?** Vercel runs serverless functions, which cap request bodies at
> around 4.5 MB and time out after a short interval. This API accepts 10 MB uploads and waits for a
> blockchain transaction to confirm, which on Sepolia takes 15–30 seconds. Render runs an ordinary
> long-lived Node process, so the Express app deploys unchanged and neither limit applies.

---

## Before you start

Create free accounts on:

| Service | For | Link |
|---|---|---|
| GitHub | Both platforms deploy from a repository | github.com |
| MongoDB Atlas | The database | mongodb.com/atlas |
| Pinata | IPFS pinning | pinata.cloud |
| Alchemy *(or Infura)* | Sepolia RPC endpoint | alchemy.com |
| Render | The backend API | render.com |
| Vercel | The frontend | vercel.com |

Push the project to GitHub first. Check before you do:

```bash
cd decentralized-storage
git status --porcelain --ignored | grep "\.env$"
```

If any `.env` file appears as tracked rather than ignored, **stop and remove it from the commit**. It
holds your secrets.

---

## Step 1 — Deploy the contract to Sepolia

### 1.1 Create a deployer wallet

This wallet deploys the contract and funds user wallets. Generate a fresh one — never reuse a
personal wallet:

```bash
cd blockchain
node -e "const w=require('ethers').Wallet.createRandom(); console.log('Address:    '+w.address); console.log('PrivateKey: '+w.privateKey); console.log('Mnemonic:   '+w.mnemonic.phrase)"
```

Save all three somewhere safe and private. You will use:

- the **private key** as `DEPLOYER_PRIVATE_KEY` here,
- the **mnemonic** as `WALLET_MNEMONIC` on Render in step 5.

### 1.2 Fund it from a faucet

Paste the address into a Sepolia faucet and request test ether:

- <https://sepoliafaucet.com>
- <https://www.alchemy.com/faucets/ethereum-sepolia>
- <https://faucet.quicknode.com/ethereum/sepolia>

Aim for at least **0.1 test ETH**. That covers the deployment plus roughly ten user wallets.

### 1.3 Get an RPC endpoint

In Alchemy, create an app on **Ethereum → Sepolia** and copy its HTTPS URL. It looks like
`https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY`.

### 1.4 Configure and deploy

```bash
cd blockchain
cp .env.example .env
```

Fill in `.env`:

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0xyour_private_key_here
```

Then:

```bash
npm install
npm run compile
npm run deploy:sepolia
```

Output:

```
Deploying with account: 0xYourDeployer...
DecentralizedStorage deployed to: 0xAbC123...
Contract ABI copied for the backend: backend/src/config/contract.json

Add this line to backend/.env (or to the hosting platform's environment):
CONTRACT_ADDRESS=0xAbC123...

Etherscan: https://sepolia.etherscan.io/address/0xAbC123...
```

**Keep that address.** Open the Etherscan link to confirm the contract is live — that page is worth
showing during a defence.

### 1.5 Commit the contract file

```bash
cd ..
git add backend/src/config/contract.json
git commit -m "Add Sepolia contract address and ABI"
```

This file holds only the address and the ABI — no secrets — and the deployed API needs it to talk to
the contract. It is deliberately not git-ignored.

*(Optional)* Publish the source on Etherscan:

```bash
cd blockchain
npx hardhat verify --network sepolia 0xAbC123...
```

---

## Step 2 — MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → add a user with a strong password. Copy it.
3. **Network Access** → add `0.0.0.0/0`. Render's free tier has no fixed outbound IP, so the
   allowlist cannot be narrowed. This is a real weakening of the database's network protection —
   the account password becomes the only barrier, so make it long and random.
4. **Connect → Drivers** → copy the connection string and add the database name before the `?`:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/decentralized_storage?retryWrites=true&w=majority
```

If the password contains `@`, `:`, `/` or `#`, URL-encode those characters.

---

## Step 3 — Pinata (IPFS)

1. Sign up at pinata.cloud.
2. **API Keys → New Key** → enable **Admin**, or at minimum `pinFileToIPFS`.
3. Copy the **JWT** (not the API key or secret). It is shown once.

The backend uses Pinata's pinning API to store encrypted files and its gateway to read them back.
The CIDs are ordinary IPFS CIDs — the same content on a local node produces the same identifier.

---

## Step 4 — Generate the remaining secrets

```bash
# AES-256 master key - 64 hex characters
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep this somewhere safe. **If you lose or change it, every file already stored becomes permanently
undecryptable** — there is no recovery path, by design.

You already have the wallet mnemonic from step 1.1. `JWT_SECRET` is generated by Render itself.

---

## Step 5 — Deploy the backend to Render

1. Render dashboard → **New → Blueprint** → select your GitHub repository.
2. Render reads [`render.yaml`](../render.yaml) and creates a service called `securechain-api`.
3. Fill in every variable marked "sync: false":

| Variable | Value |
|---|---|
| `MONGODB_URI` | The Atlas string from step 2 |
| `ENCRYPTION_KEY` | The 64 hex characters from step 4 |
| `PINATA_JWT` | The JWT from step 3 |
| `BLOCKCHAIN_RPC_URL` | Your Alchemy Sepolia URL |
| `CONTRACT_ADDRESS` | The address from step 1.4 |
| `WALLET_MNEMONIC` | The 12-word phrase from step 1.1 |
| `CLIENT_URL` | Leave blank for now — filled in at step 7 |

4. Deploy. Watch the logs for:

```
INFO  MongoDB connected: decentralized_storage
INFO  IPFS node reachable at https://api.pinata.cloud (Pinata pinning service)
INFO  Blockchain connected: chainId 11155111, contract 0xAbC123...
INFO  API listening on http://localhost:10000 (production)
```

5. Confirm it: `https://securechain-api.onrender.com/api/health` should return
   `{"success":true,"status":"ok",...}`.

**If it refuses to start** with *Refusing to use the public development mnemonic against a remote
network* — that is the safety guard in [blockchainService.js](../backend/src/services/blockchainService.js)
doing its job. `WALLET_MNEMONIC` is missing or still the public test phrase. The Hardhat phrase's
keys are known to everyone, so anything sent to those addresses can be taken instantly.

---

## Step 6 — Deploy the frontend to Vercel

1. Vercel → **Add New → Project** → import the same repository.
2. Set **Root Directory** to `frontend`. Vercel then reads
   [`frontend/vercel.json`](../frontend/vercel.json) and detects Vite automatically.
3. Add one environment variable:

```
VITE_API_URL = https://securechain-api.onrender.com
```

No trailing slash. Apply it to Production, Preview and Development.

4. Deploy. You get a URL such as `https://securechain-storage.vercel.app`.

> Anything prefixed `VITE_` is compiled into the JavaScript bundle and is **public**. Never put the
> encryption key, JWT secret, Pinata token or wallet mnemonic there — they belong to the backend
> alone.

---

## Step 7 — Connect the two (CORS)

The API rejects browser requests from origins it does not know. Back in Render, set:

```
CLIENT_URL = https://securechain-storage.vercel.app,http://localhost:5173
```

Comma-separated, no trailing slashes. Including `http://localhost:5173` lets you keep developing
against the deployed API. Save — Render redeploys automatically.

If you also want Vercel's preview deployments to work, add those URLs too. They have unique
hostnames per deployment, so it is usually simpler to test previews against a local backend.

---

## Step 8 — Create accounts

The seed script's fictional passwords are for local use only. On a live deployment, **register
through the interface** instead.

Then promote one account to administrator by running the script against the live database from your
own machine:

```bash
cd backend
MONGODB_URI="mongodb+srv://...your Atlas string..." node scripts/make-admin.js you@example.com
```

On Windows PowerShell:

```powershell
cd backend
$env:MONGODB_URI="mongodb+srv://...your Atlas string..."
node scripts/make-admin.js you@example.com
```

Role changes are deliberately an operator action — no API endpoint can grant the administrator role,
or a user could promote themselves.

---

## Step 9 — Verify the deployment

Work through this on the live site:

- [ ] Register an account — a wallet address is assigned
- [ ] Sign in
- [ ] Upload a small file — **the first upload for a new user takes 30–60 seconds** (see below)
- [ ] The result panel shows a SHA-256 hash, an IPFS CID and a transaction hash
- [ ] Paste the transaction hash into `sepolia.etherscan.io` — it is really there
- [ ] Paste the CID into `https://gateway.pinata.cloud/ipfs/<cid>` — you get **encrypted bytes**, not
      readable content. That is the confidentiality guarantee, visible
- [ ] *Verify Integrity* shows three matching hashes
- [ ] Register a second account, grant it access, download from it
- [ ] Revoke, then confirm the download returns 403
- [ ] Run the tamper test and confirm verification fails

---

## What is different once deployed

**The first upload by each user is slow.** A new user's wallet has no ether, so the backend sends it
a funding transaction and waits for confirmation, then sends the `addFile` transaction and waits
again. Two Sepolia confirmations is 30–60 seconds. Every later upload needs only one. This is worth
saying out loud in a demonstration rather than letting it look like a hang.

**Render's free tier sleeps.** After 15 minutes of no traffic the service spins down, and the next
request takes around 50 seconds to wake it. Open the site a minute before demonstrating, or hit
`/api/health` first.

**Sepolia is slower than Hardhat.** Local blocks are instant; Sepolia takes ~12 seconds and can be
slower under load. Your recorded figures in [PERFORMANCE.md](PERFORMANCE.md) are from the local
setup — keep them, and present the deployment as the public-network comparison rather than replacing
them.

**Faucet ether runs out.** Each new user costs a funding transaction. If uploads start failing with
*Blockchain transaction could not be completed*, check the deployer's balance on Etherscan and top it
up. Lower `WALLET_TOP_UP_ETH` to stretch it further.

**Rate limiting is per instance.** `express-rate-limit` keeps its counters in memory, so with more
than one instance the limits apply per instance. On Render's free single-instance tier this does not
arise, but it is a real limitation of the approach and worth acknowledging.

---

## Keeping the local setup working

None of this breaks local development. With no deployment variables set, the defaults still describe
your machine: kubo on `127.0.0.1:5001`, Hardhat on `127.0.0.1:8545`, MongoDB on `127.0.0.1:27017`,
and Vite proxying `/api` to port 5000. Run it exactly as before:

```bash
npm run chain      # terminal 1
npm run deploy     # terminal 2
npm run backend    # terminal 3
npm run frontend   # terminal 4
```

The local and deployed setups use separate databases, separate contracts and separate storage, so
they never interfere with each other.

---

## Troubleshooting

**CORS error in the browser console**
`CLIENT_URL` on Render does not exactly match the Vercel origin. It must have no trailing slash and
must include the scheme (`https://`).

**`Refusing to use the public development mnemonic against a remote network`**
Set `WALLET_MNEMONIC` on Render to your private phrase from step 1.1.

**`IPFS_PROVIDER is set to pinata, but PINATA_JWT is missing`**
Add the JWT on Render. Make sure it is the JWT, not the API key or the secret.

**Uploads fail with `Blockchain transaction could not be completed`**
Check the deployer's Sepolia balance on Etherscan, and that `CONTRACT_ADDRESS` matches what
`npm run deploy:sepolia` printed. Confirm `backend/src/config/contract.json` was committed.

**`MongooseServerSelectionError` on Render**
Atlas Network Access is missing `0.0.0.0/0`, or the password in the URI is not URL-encoded.

**Frontend loads but every request fails**
`VITE_API_URL` is missing or wrong. It is baked in at build time, so after changing it you must
**redeploy**, not just restart.

**Everything worked, then stopped after a day**
Free-tier Atlas clusters and Render services both idle down. Neither loses data; the first request
just takes longer.
