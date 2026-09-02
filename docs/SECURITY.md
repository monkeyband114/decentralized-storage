# Security design

This document explains each security mechanism in the system: what it does, why it is there, and
where to find it in the code. It is written to be read alongside the source during a project defence.

---

## 1. Password storage — bcrypt

**Where:** `backend/src/models/User.js`

Passwords are never stored. At registration the plaintext is passed through bcrypt, which produces a
60-character hash containing a random salt:

```js
userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
```

**Why bcrypt rather than SHA-256?** A hash function like SHA-256 is designed to be *fast*, which is
exactly wrong for passwords — an attacker with a leaked database can try billions of guesses per
second. bcrypt is deliberately slow (the cost factor, 10 by default here, controls how slow) and
salts every hash individually, so identical passwords produce different hashes and precomputed
rainbow tables are useless.

At login the submitted password is hashed with the stored salt and compared:

```js
userSchema.methods.verifyPassword = (plain) => bcrypt.compare(plain, this.passwordHash);
```

The comparison is constant-time, so response timing does not leak how much of the password matched.

**Account enumeration.** The login endpoint returns the same message — *Invalid email or password* —
whether the email is unknown or the password is wrong, so the form cannot be used to discover which
addresses are registered.

---

## 2. Authentication — JSON Web Tokens

**Where:** `backend/src/middleware/auth.js`

After a successful sign-in the server issues a JWT containing the user id and role, signed with
`JWT_SECRET`:

```js
jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, { expiresIn: "2h" });
```

A JWT is three base64 segments: header, payload and signature. The payload is *readable* by anyone
holding the token — it is not encrypted — but it cannot be *changed*, because any edit invalidates
the signature. A user who tries to change `"role":"user"` to `"role":"admin"` produces a token the
server rejects.

`authenticate()` validates the signature and expiry on every protected request, then loads the user
from the database. Loading the user matters: the token is only a claim, and an account that has been
deleted must stop working immediately rather than at token expiry.

**Limitation.** The token is held in `localStorage` in the browser, which any script on the page can
read. Token lifetimes are therefore short and the server re-authorises every request. A production
system would use an httpOnly cookie.

---

## 3. Authorisation

**Where:** `backend/src/middleware/auth.js`, `backend/src/controllers/fileController.js`

Three layers, in order of specificity:

1. **Route-level role checks** — `adminOnly` guards `/api/admin/*`.
2. **Ownership checks** — granting, revoking and listing permissions require the caller to be the
   file's owner.
3. **File-level permission checks** — `checkAccess()` decides whether a user may read a file.

`checkAccess()` consults two independent sources:

```js
const dbAllowed    = isOwner || await Permission.findOne({ fileId, userId, status: "active" });
const chainAllowed = await blockchainService.hasAccess(fileId, user.walletAddress);
const allowed      = chainAllowed === null ? dbAllowed : dbAllowed && chainAllowed;
```

Requiring both to agree means a permission silently inserted into the database is not enough on its
own — the contract has to agree too. When the chain cannot be reached the database decision is used
and the response records that the on-chain confirmation was unavailable.

**Everything is enforced on the server.** The React application hides buttons a user cannot use, but
that is presentation only. Calling the API directly with someone else's file id returns
`403 Access denied. You do not have permission to access this file.`

**Administrators have no special file access.** There is no route that returns file content to an
administrator who has not been granted access by the owner. This is covered by a test in
`backend/tests/access.test.js`.

---

## 4. Integrity — SHA-256

**Where:** `backend/src/services/cryptoService.js`

```js
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
```

A cryptographic hash is a one-way fingerprint. Two properties matter here:

- **Determinism** — the same bytes always produce the same 64-character digest.
- **The avalanche effect** — changing a single bit changes roughly half the output bits, so any
  modification is obvious.

The hash is taken **before** encryption, on the original plaintext. That is what makes it meaningful:
it identifies the file the user actually uploaded, independently of how it happens to be stored.

Verification recomputes the hash after retrieval and decryption, and compares it with:

- the value held in MongoDB, and
- the value recorded on the blockchain.

Both must match. `backend/src/controllers/fileController.js:retrieveAndVerify()` performs this and
returns the full comparison to the client.

---

## 5. Confidentiality — AES-256-GCM

**Where:** `backend/src/services/cryptoService.js`

IPFS is a public, content-addressed network: anyone with a CID can fetch the bytes stored there. The
file must therefore be encrypted before upload.

```
[ 12-byte IV ][ 16-byte auth tag ][ ciphertext ... ]
```

- **AES-256** — a 256-bit key, read from `ENCRYPTION_KEY`.
- **GCM** — an *authenticated* mode. Alongside the ciphertext it produces an authentication tag.
  If either is modified, decryption throws instead of returning corrupted plaintext. This gives a
  second, independent tamper detection on top of the SHA-256 comparison.
- **A fresh random IV per file** — reusing an IV with the same key breaks GCM's security completely,
  so a new 12-byte nonce is generated for every encryption.

The IV and the tag are not secrets — they only need to be unique and intact — so they are stored in
front of the ciphertext, making the blob self-contained.

**Limitation.** One master key protects every file. Losing it exposes all content and rotating it
would require re-encrypting everything. A production system would derive a key per file and store
those keys in a key management service.

---

## 6. Decentralized storage — IPFS

**Where:** `backend/src/services/ipfsService.js`

IPFS addresses content by its hash rather than by location. The CID is derived from the bytes
themselves, so:

- the same content always yields the same CID, and
- **content behind an existing CID cannot be edited** — different bytes are simply a different CID.

That property is what makes the on-chain CID meaningful. If the application is later pointed at
different content, the CID it holds no longer matches the CID recorded on the chain, and the
verification page reports it.

Only the encrypted blob is uploaded. Plaintext never leaves the server.

---

## 7. Blockchain metadata — the smart contract

**Where:** `blockchain/contracts/DecentralizedStorage.sol`

The contract stores, per file: the file id, the owner's address, the CID, the SHA-256 hash and a
timestamp — plus a permission mapping.

```solidity
require(!files[fileId].exists, "File already recorded");
```

Records are **append-only**: a file id can be registered once and never overwritten. Combined with
the immutability of confirmed transactions, this makes the stored hash an independent reference that
neither the application nor its database can revise.

Access control lives in the contract too:

```solidity
modifier onlyOwner(string memory fileId) {
    require(files[fileId].exists, "File not found");
    require(files[fileId].owner == msg.sender, "Not the file owner");
    _;
}
```

`grantAccess` and `revokeAccess` both carry this modifier, so a transaction from any address other
than the owner's reverts — enforced by the network, not by the application.

**Why not store the file itself on-chain?** Cost and privacy. Every node stores every byte of chain
data forever, and all of it is public. Storing a reference and a hash gives tamper-evidence without
either problem.

---

## 8. Wallets

**Where:** `backend/src/services/blockchainService.js`

Each user is assigned a deterministic wallet derived from the local network's well-known test
mnemonic at path `m/44'/60'/0'/0/<index>`, and the backend signs that user's transactions with it.
This keeps the contract's `onlyOwner` check meaningful: a grant transaction really is signed by the
file's owner, not by a shared server account.

**Limitation.** These keys are custodial and only safe because the network is a local test chain with
valueless ETH. A production system would have each user sign with their own wallet, for example
through MetaMask.

---

## 9. Input validation and upload safety

**Where:** `backend/src/routes/index.js`, `middleware/validate.js`, `middleware/upload.js`

- Registration and login inputs are validated and normalised with `express-validator`; the password
  policy (at least 8 characters, a letter and a number) is enforced on the server, and mirrored in
  the browser only for immediate feedback.
- Uploads use **memory storage**, so plaintext is never written to disk — it is hashed and encrypted
  in RAM.
- File types are checked against an **allowlist** of extensions and MIME types. An allowlist is safer
  than a blocklist: anything unanticipated is refused rather than accepted by default.
- A size limit (`MAX_FILE_SIZE_MB`, default 10 MB) prevents resource-exhaustion uploads.
- Mongoose schemas are typed and length-limited, and the driver parameterises queries, so user input
  cannot be interpreted as query structure.

---

## 10. Transport and HTTP hardening

**Where:** `backend/src/app.js`, `backend/src/middleware/rateLimit.js`

- **Helmet** sets protective response headers — no MIME sniffing, frame denial (clickjacking), a
  strict referrer policy, and removal of the `X-Powered-By` fingerprint.
- **CORS** is restricted to the configured frontend origin, so an arbitrary website cannot make
  authenticated calls from a victim's browser.
- **Rate limiting** caps authentication attempts at 20 per IP per 15 minutes, which makes online
  password guessing impractical. The rest of the API has a gentler cap.
- **Body size limits** keep oversized JSON payloads from exhausting memory.

---

## 11. Error handling and logging

**Where:** `backend/src/middleware/errorHandler.js`, `backend/src/utils/logger.js`

Every error passes through one handler. Clients receive a short message and a status code; stack
traces and internal messages stay in the server log. Server-side failures (5xx) are collapsed to
*Something went wrong. Please try again.* so internal details cannot be probed through error text.

Passwords, tokens and keys are never passed to the logger.

---

## 12. Audit trail

**Where:** `backend/src/utils/activity.js`, `backend/src/models/ActivityLog.js`

Every security-relevant action is recorded: registration, sign-in (successful and failed), upload,
download, verification, grant, revoke, and every denied attempt. Each entry holds the user, the
action, the file, a status of `success` / `failure` / `denied`, the client address and a timestamp.

Denied attempts are the important ones: they are what makes an attempted unauthorised access visible
after the fact, both to the user on the *Activity* page and to an administrator on *System activity*.

---

## 13. Threat model summary

| Threat | Control |
|---|---|
| Stolen database dump | Passwords are bcrypt hashes; file content is not in the database at all |
| Someone reading files off IPFS | Content is AES-256-GCM encrypted before upload |
| A user requesting someone else's file | Server-side permission check against the database and the contract |
| An administrator reading private files | No route returns content without an owner-granted permission |
| Stored file quietly replaced | Recomputed hash no longer matches the stored and on-chain values |
| Database hash edited to cover a replacement | The on-chain hash is immutable and still disagrees |
| Ciphertext modified in place | AES-GCM authentication tag fails and decryption is refused |
| Permission inserted directly into the database | The contract's permission list does not agree |
| Password brute force | bcrypt cost factor plus per-IP rate limiting |
| Forged or altered token | JWT signature verification |
| Executable or oversized upload | Extension and MIME allowlist, plus a size limit |
| Stack traces leaking internals | Central error handler returns safe messages only |
| Unauthorised action going unnoticed | Append-only activity log, including denials |
