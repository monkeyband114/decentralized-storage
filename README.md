# SecureChain Storage

**A decentralized storage system that preserves data integrity and enforces access control.**

Files are hashed, encrypted and stored on IPFS. Their fingerprints, owners and permissions are
recorded on an Ethereum smart contract. Every retrieval re-hashes the file and compares it with the
on-chain record, so any modification to stored content is detected before the file reaches the user.

---

## Table of contents

1. [What the system does](#1-what-the-system-does)
2. [Architecture](#2-architecture)
3. [Technologies](#3-technologies)
4. [Prerequisites](#4-prerequisites)
5. [Installation](#5-installation)
6. [MongoDB setup](#6-mongodb-setup)
7. [IPFS setup](#7-ipfs-setup)
8. [Blockchain setup](#8-blockchain-setup)
9. [Smart contract deployment](#9-smart-contract-deployment)
10. [Environment variables](#10-environment-variables)
11. [Backend setup](#11-backend-setup)
12. [Frontend setup](#12-frontend-setup)
13. [Running the system](#13-running-the-system)
14. [Development accounts](#14-development-accounts)
15. [Example workflow](#15-example-workflow)
16. [API endpoints](#16-api-endpoints)
17. [Security features](#17-security-features)
18. [Testing](#18-testing)
19. [Performance evaluation](#19-performance-evaluation)
20. [Troubleshooting](#20-troubleshooting)
21. [Deployment](#21-deployment)
22. [Known limitations](#22-known-limitations)

---

## 1. What the system does

A registered user can upload a file. Before the file leaves the server it is fingerprinted with
SHA-256 and encrypted with AES-256-GCM. The encrypted file is pushed to IPFS, which returns a
content identifier (CID). The CID, the SHA-256 hash, the owner's address and a timestamp are written
to a Solidity smart contract on a local Ethereum network. The application metadata is saved in
MongoDB.

The owner can grant another registered user access to the file. That grant is a transaction on the
smart contract; only the owner's address can send it. When anyone downloads the file, the server
checks the permission, fetches the encrypted bytes from IPFS, decrypts them, recomputes the SHA-256
hash and compares it against both the database and the blockchain. If the values disagree the
download is refused.

The security story in one line:

```
User -> Authentication -> Authorization -> Hash + Encrypt -> IPFS -> Blockchain metadata
     -> Controlled retrieval -> Integrity verification
```

---

## 2. Architecture

```
                    ┌─────────────────────┐
                    │      React UI       │
                    │    Tailwind CSS     │
                    └──────────┬──────────┘
                               │  REST + JWT
                               ▼
                    ┌─────────────────────┐
                    │    Express API      │
                    │  Authentication     │
                    │  Authorization      │
                    │  File processing    │
                    └──────┬───────┬──────┘
                           │       │
                 ┌─────────┘       └────────────┐
                 ▼                              ▼
        ┌─────────────────┐             ┌───────────────┐
        │    MongoDB      │             │  Encryption   │
        │ User accounts   │             │   + Hashing   │
        │ File metadata   │             └───────┬───────┘
        │ Permissions     │                     │
        │ Activity logs   │                     ▼
        └─────────────────┘             ┌───────────────┐
                                        │     IPFS      │
                                        │Encrypted file │
                                        └───────┬───────┘
                                                │ CID
                                                ▼
                                     ┌────────────────────┐
                                     │ Ethereum Smart     │
                                     │ Contract           │
                                     │  CID               │
                                     │  File hash         │
                                     │  Owner             │
                                     │  Permissions       │
                                     │  Timestamp         │
                                     └────────────────────┘
```

The file itself never touches the blockchain. Only the reference and the hash do, which is what keeps
on-chain storage cheap while still making tampering detectable.

Folder layout:

```
decentralized-storage/
├── frontend/           React + Vite + Tailwind single-page application
├── backend/            Express REST API, encryption, IPFS and chain integration
├── blockchain/         Solidity contract, Hardhat config, deployment script, contract tests
├── docs/               Architecture, security, testing checklist, performance results
├── .env.example        Environment template (copy to backend/.env)
└── README.md
```

---

## 3. Technologies

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Express, JWT, bcrypt, multer, Helmet |
| Database | MongoDB with Mongoose |
| Blockchain | Solidity 0.8.24, Hardhat, ethers.js v6 |
| Storage | IPFS (kubo) via the HTTP API |
| Cryptography | SHA-256 hashing, AES-256-GCM encryption (Node `crypto`) |
| Testing | Jest, Supertest, Hardhat/Chai |

---

## 4. Prerequisites

Install these before you start:

- **Node.js 18 or newer** — <https://nodejs.org> (check with `node -v`)
- **MongoDB** — a local server, MongoDB Atlas, or Docker (see section 6)
- **IPFS Kubo** — IPFS Desktop or the `ipfs` CLI — <https://docs.ipfs.tech/install/>
- **Git** (optional, for cloning)

No cryptocurrency and no account with any blockchain service is required. Everything runs locally.

---

## 5. Installation

```bash
# from the folder that contains this README
cd decentralized-storage

# install every package (backend, frontend, blockchain)
npm run install:all
```

If you prefer to do it by hand:

```bash
cd blockchain && npm install
cd ../backend  && npm install
cd ../frontend && npm install
```

---

## 6. MongoDB setup

Pick **one** of these.

**Option A — Docker (quickest)**

```bash
docker run -d --name dss-mongo -p 27017:27017 mongo:7
```

Connection string: `mongodb://127.0.0.1:27017/decentralized_storage`

**Option B — Local installation**

Install MongoDB Community Server, then confirm the service is running:

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
```

**Option C — MongoDB Atlas (free tier)**

Create a free cluster, add your IP to the network access list, and copy the connection string into
`MONGODB_URI` in `backend/.env`.

---

## 7. IPFS setup

Install IPFS Kubo, initialise the repository once, then start the daemon and leave it running:

```bash
ipfs init          # only the first time
ipfs daemon
```

You should see `API server listening on /ip4/127.0.0.1/tcp/5001`. Confirm it with:

```bash
curl -X POST http://127.0.0.1:5001/api/v0/version
```

If you use IPFS Desktop, simply launch the application — it starts the same daemon.

> If no IPFS daemon is reachable, the backend falls back to a local content-addressed store so the
> application still runs. It computes a real CIDv1 over the same bytes, but for files larger than one
> IPFS chunk that CID differs from what a daemon would produce. Run the daemon for a faithful
> demonstration. The sidebar shows which backend is in use.

---

## 8. Blockchain setup

Start the local Ethereum network and leave it running in its own terminal:

```bash
cd blockchain
npx hardhat node
```

This prints twenty funded test accounts on `http://127.0.0.1:8545` (chain ID 31337). The private keys
it displays are publicly known development keys and hold no real value.

---

## 9. Smart contract deployment

In a **second** terminal, with the node from section 8 still running:

```bash
cd blockchain
npm run compile
npm run deploy
```

Output:

```
DecentralizedStorage deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Deployment details written to: blockchain/deployments/DecentralizedStorage.json
Contract ABI copied for the backend: backend/src/config/contract.json
```

The deployment script writes the address and the ABI where the backend reads them, so no manual
copying is needed. Re-run `npm run deploy` whenever you restart the Hardhat node — a fresh node starts
with an empty chain.

---

## 10. Environment variables

```bash
cp .env.example backend/.env
```

Then generate your own secrets and paste them in:

```bash
# JWT signing secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# AES-256 master key (must be exactly 64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `ENCRYPTION_KEY` | 64 hex characters — the AES-256-GCM master key |
| `BLOCKCHAIN_RPC_URL` | JSON-RPC endpoint of the local chain (`http://127.0.0.1:8545`) |
| `CONTRACT_ADDRESS` | Optional override; the deployment file is used when blank |
| `IPFS_API_URL` | IPFS HTTP API (`http://127.0.0.1:5001`) |
| `MAX_FILE_SIZE_MB` | Upload size limit (default 10) |
| `ALLOW_TAMPER_SIMULATION` | Enables the owner-only tamper detection test |

`.env` is listed in `.gitignore` and must never be committed. Only `.env.example` belongs in version
control.

---

## 11. Backend setup

```bash
cd backend
npm install
npm run seed      # creates the development accounts
npm run dev       # starts on http://localhost:5000 with auto-reload
```

A healthy start looks like this:

```
INFO  MongoDB connected: decentralized_storage
INFO  IPFS node reachable at http://127.0.0.1:5001 (kubo 0.23.0)
INFO  Blockchain connected: chainId 31337, contract 0x5FbD...0aa3
INFO  API listening on http://localhost:5000 (development)
```

Check it directly:

```bash
curl http://localhost:5000/api/health
```

---

## 12. Frontend setup

```bash
cd frontend
npm install
npm run dev       # starts on http://localhost:5173
```

Vite proxies `/api` to `http://localhost:5000`, so the browser only ever talks to one origin.

---

## 13. Running the system

Four terminals, in this order:

| # | Folder | Command | What it is |
|---|---|---|---|
| 1 | `blockchain` | `npx hardhat node` | Local Ethereum network |
| 2 | `blockchain` | `npm run deploy` | Deploy the contract (run once per node restart) |
| 3 | `backend` | `npm run dev` | REST API on port 5000 |
| 4 | `frontend` | `npm run dev` | User interface on port 5173 |

Plus MongoDB and `ipfs daemon` running in the background.

Or, from the project root:

```bash
npm run chain      # terminal 1
npm run deploy     # terminal 2, once
npm run backend    # terminal 3
npm run frontend   # terminal 4
```

Then open <http://localhost:5173>.

---

## 14. Development accounts

`npm run seed` (in `backend/`) creates these accounts:

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `AdminDev2024` | Administrator |
| `alice@example.com` | `UserDev2024` | User |
| `bob@example.com` | `UserDev2024` | User |

These are fictional development credentials for local testing only. **Change or remove them before
running the system anywhere else.** The seed script refuses to run when `NODE_ENV=production`.

`npm run seed -- --reset` clears every collection first and starts from scratch.

---

## 15. Example workflow

A complete demonstration, start to finish:

1. **Sign in** as `alice@example.com`.
2. **Upload a file** — go to *Upload File*, choose a document, add a description, upload. The result
   panel shows the SHA-256 hash, the IPFS CID, the transaction hash and the timing of each stage.
3. **Inspect the record** — open the file from *My Files*. The right-hand card shows the metadata as
   the smart contract holds it, next to the metadata the database holds.
4. **Verify integrity** — go to *Verify Integrity*. The stored hash, the freshly recomputed hash and
   the blockchain hash appear side by side, with a green **Integrity verified** banner.
5. **Grant access** — open *Manage access*, pick `Bob Demo`, grant. A transaction hash appears.
6. **Sign in as Bob** (`bob@example.com`). The file is under *Shared With Me* and downloads
   successfully with the header `X-Integrity-Status: VERIFIED`.
7. **Revoke access** as Alice. Bob's next download attempt returns
   `403 Access denied. You do not have permission to access this file.`
8. **Demonstrate tamper detection** — as Alice, on *Verify Integrity*, choose
   **Replace content and database hash**. Verification now shows a red **Integrity verification
   failed** banner: the database and the recomputed hash agree with each other, but neither matches
   the value on the blockchain. Download is refused. Press **Restore original** to undo it.

Step 8 is the strongest demonstration in the system: it shows that even an attacker who can edit the
application's own database cannot hide a change, because the blockchain record cannot be rewritten.

---

## 16. API endpoints

All routes are prefixed with `/api`. Everything except registration and login requires
`Authorization: Bearer <token>`.

**Authentication**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Sign in and receive a JWT |
| POST | `/auth/logout` | Record the sign-out |
| GET | `/users/me` | The signed-in user's profile |
| GET | `/users` | Other registered users (for the access picker) |

**Files**

| Method | Endpoint | Description |
|---|---|---|
| POST | `/files/upload` | Hash, encrypt, store on IPFS, record on-chain |
| GET | `/files` | Files owned by the signed-in user |
| GET | `/files/shared` | Files shared with the signed-in user |
| GET | `/files/:id` | File metadata plus the on-chain record |
| GET | `/files/:id/download` | Retrieve, decrypt, verify and return the file |
| GET | `/files/:id/verify` | Run an integrity check and return the hash comparison |
| GET | `/files/:id/permissions` | Current authorised users (owner only) |
| POST | `/files/:id/grant` | Grant access (owner only) |
| DELETE | `/files/:id/revoke/:userId` | Revoke access (owner only) |
| POST | `/files/:id/simulate-tamper` | Tamper detection test (owner only) |
| POST | `/files/:id/restore` | Undo the tamper test (owner only) |

**Activity and blockchain**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Dashboard counters and recent activity |
| GET | `/activity` | The user's own audit trail |
| GET | `/blockchain/transactions` | Transactions written by this application |
| GET | `/blockchain/status` | Chain and IPFS health |
| GET | `/blockchain/files/:fileId` | The raw on-chain record for a file |

**Administrator**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/statistics` | System-wide counters |
| GET | `/admin/users` | Registered accounts |
| GET | `/admin/activity` | The complete audit trail |
| GET | `/admin/files` | File metadata across all users |

---

## 17. Security features

| Mechanism | Where | What it protects against |
|---|---|---|
| bcrypt password hashing | `models/User.js` | Password disclosure if the database leaks |
| JWT authentication | `middleware/auth.js` | Unauthenticated API access |
| Role authorisation | `middleware/auth.js` | Ordinary users reaching admin routes |
| File-level permissions | `controllers/fileController.js` + contract | Unauthorised file retrieval |
| SHA-256 hashing | `services/cryptoService.js` | Undetected modification of stored files |
| AES-256-GCM encryption | `services/cryptoService.js` | Reading file content straight off IPFS |
| On-chain hash record | `DecentralizedStorage.sol` | Tampering that also edits the database |
| Input validation | `routes/index.js`, `middleware/validate.js` | Malformed and injected input |
| File type allowlist | `middleware/upload.js` | Uploading executables and unknown types |
| File size limit | `middleware/upload.js` | Resource-exhaustion uploads |
| Rate limiting | `middleware/rateLimit.js` | Password brute-force attempts |
| Helmet headers | `app.js` | Clickjacking, MIME sniffing, fingerprinting |
| CORS allowlist | `app.js` | Cross-site requests from unknown origins |
| Central error handler | `middleware/errorHandler.js` | Stack traces leaking to clients |
| Audit logging | `utils/activity.js` | Actions going unrecorded, including denials |

Two points worth stating explicitly:

- **Authorisation is enforced on the server, never in the browser.** Hiding a button is a convenience;
  every request is re-checked against the database and the smart contract.
- **An administrator cannot read a user's private files.** Administration covers metadata and audit
  records only. Reading a file still requires a permission granted by its owner and recorded on-chain.

`docs/SECURITY.md` explains each mechanism in more detail.

---

## 18. Testing

**Smart contract tests** (13 tests):

```bash
cd blockchain
npx hardhat test
```

**Backend API tests** (43 tests — authentication, encryption, upload, integrity, access control):

```bash
cd backend
npm test
```

The API tests use a separate `dss_test` database and an in-memory stand-in for the chain, so they
need only MongoDB to be running.

A manual test checklist for the project defence is in `docs/TESTING-CHECKLIST.md`.

---

## 19. Performance evaluation

With everything running:

```bash
cd backend
npm run performance -- --runs 3
```

This measures authentication, upload (broken down into hashing, encryption, IPFS and blockchain
time), retrieval and verification across 100 KB, 500 KB, 1 MB, 5 MB and 10 MB files, and writes
`docs/performance-results.csv`. See `docs/PERFORMANCE.md` for a recorded run and its interpretation.

---

## 20. Troubleshooting

**`MongooseServerSelectionError` on startup**
MongoDB is not running or `MONGODB_URI` is wrong. Start it (`docker start dss-mongo`) and check the
value in `backend/.env`.

**`Blockchain transaction could not be completed.` when uploading**
The Hardhat node is not running, or the contract has not been deployed to it. Start
`npx hardhat node`, then run `npm run deploy` again. A restarted node always needs a fresh deploy.

**The sidebar shows IPFS offline / `storageBackend: local`**
The IPFS daemon is not reachable. Run `ipfs daemon` and reload. The application keeps working using
the local content-addressed fallback, but the demonstration is more faithful with the daemon running.

**`ENCRYPTION_KEY must be exactly 64 hexadecimal characters`**
Generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste it into
`backend/.env`.

**Uploads fail after restarting the Hardhat node, with `File already recorded`**
The database still holds files whose records lived on the old chain. Run `npm run seed -- --reset` in
`backend/` to start from a clean state.

**`Too many attempts from this address`**
The login rate limiter has tripped. Wait 15 minutes, or restart the backend during development.

**Port already in use**
Change `PORT` in `backend/.env`, or the `server.port` value in `frontend/vite.config.js`.

**Integrity verification fails unexpectedly**
Check whether a tamper test was left applied — the file list shows a *Content replaced* badge. Use
**Restore original** on the *Verify Integrity* page.

---

## 21. Deployment

The system runs locally with no deployment at all, which is what the project report describes. If you
also want a public URL, the supported setup is:

| Part | Platform | Why |
|---|---|---|
| Frontend | Vercel | Static Vite build; ideal fit |
| Backend | Render | A long-lived Node process, so 10 MB uploads and slow blockchain confirmations both work |
| Contract | Sepolia testnet | A real public chain; transactions verifiable on Etherscan |
| Files | Pinata (IPFS) | A hosting platform runs no IPFS daemon of its own |
| Database | MongoDB Atlas | Managed, free tier |

Everything is free-tier and no real cryptocurrency is involved — Sepolia ether comes from a faucet.

**The backend is deliberately not on Vercel.** Vercel runs serverless functions, which cap request
bodies at roughly 4.5 MB and time out quickly; this API accepts 10 MB uploads and waits for a Sepolia
transaction to confirm, which takes 15-30 seconds. Render runs the Express app unchanged.

Full step-by-step instructions, including the faucet, the RPC key, every environment variable and a
verification checklist, are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Configuration files already in the repository:

- [`frontend/vercel.json`](frontend/vercel.json) — Vercel build and SPA routing
- [`render.yaml`](render.yaml) — Render blueprint listing every backend variable
- [`blockchain/.env.example`](blockchain/.env.example) — Sepolia RPC and deployer key

Deploying changes nothing about local development: with no deployment variables set, all the defaults
still point at your own machine.

---

## 22. Known limitations

These are deliberate simplifications, documented so they can be discussed honestly:

1. **One server-side encryption key.** Every file is encrypted with the same AES master key held in
   `ENCRYPTION_KEY`. Losing it exposes all content, and rotating it would mean re-encrypting
   everything. A production system would derive a key per file and hold them in a key management
   service.
2. **Custodial wallets.** Each user is assigned a deterministic wallet derived from the local test
   mnemonic, and the backend signs on their behalf. This is only acceptable because the chain is a
   local test network with valueless ETH. Real users would hold their own keys.
3. **Test networks only.** The system targets a Hardhat/Ganache development chain locally, or the
   Sepolia test network when deployed. Nothing is deployed to Ethereum mainnet and no real funds are
   involved at any point.
4. **Tokens in browser storage.** The JWT is kept in `localStorage`, which is readable by any script
   on the page. Token lifetimes are short and the server re-checks every request, but a production
   system would prefer an httpOnly cookie.
5. **Single IPFS node.** Files are pinned to one local node. Genuine decentralization would require
   pinning across several peers or a pinning service.
6. **Access revocation is an application-level control.** Revoking removes the permission from the
   contract and the API refuses the download, but anyone who already downloaded a copy keeps it, and
   the encrypted bytes remain addressable on IPFS by CID.
