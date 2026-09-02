# Architecture

How the pieces fit together, and why each one is where it is.

---

## 1. Layers

```
┌───────────────────────────────────────────────────────────────┐
│  Presentation        React + Vite + Tailwind (port 5173)      │
│                      Routing, forms, tables, status display   │
└───────────────────────────────┬───────────────────────────────┘
                                │ REST over HTTP, JWT in the
                                │ Authorization header
┌───────────────────────────────▼───────────────────────────────┐
│  Application         Express REST API (port 5000)             │
│                      Authentication, authorisation,           │
│                      file processing, audit logging           │
└───┬───────────────────┬────────────────────┬──────────────────┘
    │                   │                    │
┌───▼──────────┐  ┌─────▼──────────┐  ┌──────▼─────────────────┐
│  MongoDB     │  │  IPFS (kubo)   │  │  Ethereum (Hardhat)    │
│  Metadata    │  │  Encrypted     │  │  Hashes, owners,       │
│  Permissions │  │  file content  │  │  permissions           │
│  Audit log   │  │                │  │                        │
└──────────────┘  └────────────────┘  └────────────────────────┘
```

Each storage layer holds exactly one kind of thing:

- **MongoDB** — everything the application needs to render a page quickly: accounts, file metadata, a
  mirror of the permissions and the audit trail. It is fast and queryable, but it is also mutable,
  which is precisely why it is not trusted on its own.
- **IPFS** — the encrypted file content, addressed by its own hash. Content-addressing means the bytes
  behind a CID cannot be edited.
- **Ethereum** — the small, immutable facts that everything else is checked against: the SHA-256 hash,
  the CID, the owner and the permission list.

The design deliberately splits *what is convenient* from *what is trustworthy*. MongoDB is the
convenient copy; the chain is the reference.

---

## 2. Backend structure

```
backend/src/
├── app.js                  Express setup: Helmet, CORS, body limits, routes, errors
├── server.js               Startup: connect to MongoDB, report IPFS and chain health
├── config/
│   ├── env.js              Reads and validates every environment variable
│   ├── db.js               MongoDB connection
│   └── contract.json       Contract address + ABI (written by the deploy script)
├── models/                 Mongoose schemas
│   ├── User.js             Accounts, bcrypt helpers
│   ├── File.js             File metadata, hash, CID, transaction reference
│   ├── Permission.js       Access grants, mirroring the contract
│   ├── ActivityLog.js      Audit trail
│   └── Transaction.js      Local mirror of chain transactions, for the UI
├── middleware/
│   ├── auth.js             issueToken, authenticate, authorize, adminOnly
│   ├── upload.js           multer: memory storage, size limit, type allowlist
│   ├── validate.js         express-validator result handling
│   ├── rateLimit.js        Per-IP limits on authentication and the API
│   └── errorHandler.js     One place where every error becomes a safe response
├── services/               The three security-relevant integrations
│   ├── cryptoService.js    SHA-256 hashing, AES-256-GCM encryption
│   ├── ipfsService.js      IPFS HTTP API, with a local content-addressed fallback
│   └── blockchainService.js ethers.js: contract calls, wallets, status
├── controllers/            Request handling, one file per area
└── routes/index.js         Every endpoint, with its middleware chain
```

Controllers hold the workflow; services hold the mechanisms. That separation is the only abstraction
in the backend, and it exists so the security-relevant code sits in three small, readable files.

---

## 3. Upload pipeline

```
  Browser                Express API                    External systems
     │
     │ POST /api/files/upload (multipart, JWT)
     ├──────────────────────►│
     │                       │ 1. authenticate()      verify the JWT
     │                       │ 2. multer              size + type checks, memory only
     │                       │ 3. sha256(buffer)      fingerprint the ORIGINAL file
     │                       │ 4. encryptBuffer()     AES-256-GCM, fresh IV
     │                       │
     │                       │ 5. ipfs add ──────────────────► IPFS
     │                       │◄────────────────────── CID
     │                       │
     │                       │ 6. addFile(fileId, cid, hash) ──► Smart contract
     │                       │◄────────────────────── tx receipt
     │                       │
     │                       │ 7. File.create()  ─────────────► MongoDB
     │                       │    Transaction.create()
     │                       │    ActivityLog.create()
     │◄──────────────────────┤
     │ 201 + metadata + timings
```

Two ordering decisions matter:

- **Hash before encryption.** The hash must identify the file the user uploaded, independently of how
  it is stored. Hashing the ciphertext would prove only that the ciphertext was unchanged.
- **Chain before database.** If the transaction fails, nothing is written to MongoDB and the upload
  reports *Blockchain transaction could not be completed.* A file without an on-chain reference could
  never be verified, so it is better not to accept it at all.

---

## 4. Retrieval and verification pipeline

```
  Browser                Express API                    External systems
     │
     │ GET /api/files/:id/download (JWT)
     ├──────────────────────►│
     │                       │ 1. authenticate()
     │                       │ 2. checkAccess()  ─── MongoDB permission
     │                       │                  └──► contract hasAccess()
     │                       │      both must agree, or 403
     │                       │
     │                       │ 3. ipfs cat <cid> ────────────► IPFS
     │                       │◄────────────────────── encrypted bytes
     │                       │
     │                       │ 4. decryptBuffer()    GCM tag checked here
     │                       │ 5. sha256(plaintext)  recompute
     │                       │
     │                       │ 6. getFile(fileId) ───────────► Smart contract
     │                       │◄────────────────────── recorded hash
     │                       │
     │                       │ 7. compare: calculated == stored == on-chain ?
     │◄──────────────────────┤
     │ 200 + file + X-Integrity-Status: VERIFIED
     │   ...or 409 Integrity verification failed
```

The comparison has three inputs and two independent ways to fail, which is what gives the check its
strength:

| Situation | Stored hash | On-chain hash | Detected by |
|---|---|---|---|
| Everything intact | matches | matches | — |
| Stored content replaced | mismatch | mismatch | both |
| Content replaced **and** database hash rewritten | matches | **mismatch** | the chain alone |
| Ciphertext altered in place | — | — | AES-GCM authentication tag |

Row three is the case that justifies the blockchain: an attacker with full control of the
application's database still cannot make a modified file look authentic.

---

## 5. Data model

```
users                         files
├── _id                       ├── _id
├── name                      ├── fileId          ─────┐ shared key with the contract
├── email (unique)            ├── ownerId ──────────┐  │
├── passwordHash (bcrypt)     ├── ownerWallet       │  │
├── role  user | admin        ├── fileName          │  │
├── walletAddress             ├── description       │  │
├── walletIndex               ├── fileSize          │  │
└── createdAt                 ├── sha256Hash        │  │
      ▲                       ├── ipfsCid           │  │
      │                       ├── blockchainTxHash  │  │
      │                       └── createdAt         │  │
      │                                             │  │
      ├─────────────────────────────────────────────┘  │
      │                                                │
permissions                   activityLogs             │
├── _id                       ├── _id                  │
├── fileId ───────────────────┼── userId               │
├── userId ───────────────────┤   action               │
├── grantedBy                 ├── fileId ──────────────┤
├── status active|revoked     ├── details              │
├── txHash                    ├── status               │
└── createdAt                 └── timestamp            │
                                                       │
transactions                                           │
├── txHash (unique)                                    │
├── action addFile|grantAccess|revokeAccess            │
├── fileId ───────────────────────────────────────────-┘
├── userId
├── blockNumber, gasUsed, status
└── timestamp
```

`fileId` is the join key between MongoDB and the smart contract: the same string identifies the file
in both, so a record on one side can always be checked against the other.

**A note on `transactions`.** The report specifies four collections. This one is a fifth, added to
serve the Blockchain Activity and administrator transaction views. It is a cache of transactions that
are already confirmed on the chain — it is never consulted when deciding whether a file is authentic,
and nothing written to it can change what the contract holds.

---

## 6. Smart contract

```solidity
struct FileRecord {
    string  fileId;      // application identifier, shared with MongoDB
    address owner;       // uploader's address
    string  cid;         // IPFS CID of the ENCRYPTED file
    string  fileHash;    // SHA-256 of the ORIGINAL file
    uint256 timestamp;   // block timestamp
    bool    exists;      // distinguishes an empty struct from a real record
}

mapping(string => FileRecord) private files;
mapping(string => mapping(address => bool)) private accessList;
```

| Function | Type | Notes |
|---|---|---|
| `addFile(fileId, cid, fileHash)` | write | Reverts if `fileId` already exists — append-only |
| `grantAccess(fileId, user)` | write | `onlyOwner` |
| `revokeAccess(fileId, user)` | write | `onlyOwner` |
| `getFile(fileId)` | view | Returns the recorded metadata |
| `hasAccess(fileId, user)` | view | The authorisation check the backend calls |
| `fileExists(fileId)` | view | Existence test |
| `getFileCount()` / `getFileIdAt(i)` | view | Simple enumeration |

Events `FileUploaded`, `AccessGranted` and `AccessRevoked` publish the audit trail on-chain.

Views cost nothing and create no transaction, so `hasAccess` can be called on every download without
a performance or gas penalty.

---

## 7. Frontend structure

```
frontend/src/
├── App.jsx                 Routes and the RequireAuth / adminOnly guards
├── context/
│   ├── AuthContext.jsx     Current user, sign-in, sign-out, session restore
│   └── ToastContext.jsx    Notifications
├── services/api.js         fetch wrapper: token handling, errors, binary download
├── layouts/AppLayout.jsx   Sidebar, top bar, live IPFS and chain status
├── components/
│   ├── ui.jsx              Cards, buttons, tables, badges, modals, formatters
│   └── FileTable.jsx       The file listing shared by two pages
├── hooks/useFileActions.js Download and verify, with their result handling
└── pages/                  One file per screen
```

The route guards decide what the browser renders, nothing more. Every request is re-authorised by the
API, so bypassing a guard in the browser gains an attacker nothing.

---

## 8. Request lifecycle

```
Request
  → Helmet                 security response headers
  → CORS                   origin allowlist
  → express.json           body parsing with a size limit
  → apiLimiter             per-IP rate limit
  → authLimiter            stricter limit, on /auth routes only
  → express-validator      input validation and normalisation
  → authenticate()         JWT verification, user loaded from the database
  → authorize()/adminOnly  role check where required
  → controller             ownership and file-level permission checks
  → services               crypto / IPFS / chain
  → response
                           any thrown error → errorHandler → safe JSON
```
