# Testing

Automated tests plus a manual checklist to work through before a demonstration.

---

## 1. Automated tests

### Smart contract — 13 tests

```bash
cd blockchain
npx hardhat test
```

| Area | Tests |
|---|---|
| `addFile` | records metadata, emits `FileUploaded`, rejects a malformed hash, refuses to overwrite an existing record, gives the uploader access, counts files |
| Access control | denies unrelated users by default, owner can grant, owner can revoke, non-owner cannot grant, non-owner cannot revoke, cannot revoke what was never granted |
| `getFile` | reverts for an unknown file, reports existence correctly |

### Backend API — 43 tests

```bash
cd backend
npm test
```

Requires MongoDB. The chain is replaced by an in-memory stand-in
(`src/services/__mocks__/blockchainService.js`) and IPFS uses the local content-addressed store, so
neither daemon needs to be running.

| File | Covers |
|---|---|
| `tests/auth.test.js` | registration, duplicate email, weak password, invalid email, correct and incorrect login, account enumeration, bcrypt storage, missing/forged token, admin route protection |
| `tests/files.test.js` | SHA-256 determinism and avalanche, AES round-trip, fresh IV per encryption, GCM tamper rejection, upload pipeline, ciphertext-only storage, file type rejection, size limit, download with verification, tamper detection (both modes), tamper simulation authorisation |
| `tests/access.test.js` | denied by default, admin denied, denial logged, owner access, grant, grantee download, Shared With Me, non-owner cannot grant, unknown grantee, duplicate grant, revoke, revoked user denied, non-owner cannot revoke, permission listing restricted to the owner |

Run everything from the project root with `npm test`.

---

## 2. Manual checklist

Tick these off before the defence. Expected results are stated so a deviation is obvious.

### Setup

- [ ] MongoDB is running
- [ ] `ipfs daemon` is running — the sidebar shows **IPFS node · Online**
- [ ] `npx hardhat node` is running and the contract is deployed — the sidebar shows a block number
- [ ] `npm run seed` has been run
- [ ] Backend log shows all three subsystems connected

### Authentication

| # | Step | Expected |
|---|---|---|
| 1 | Register a new account with a valid email and password | Account created, redirected to the dashboard, a wallet address is assigned |
| 2 | Register again with the same email | *An account with this email address already exists.* |
| 3 | Register with the password `abc` | Rejected, the required format is stated |
| 4 | Sign in with the correct password | Dashboard opens, a toast reports the sign-in time |
| 5 | Sign in with a wrong password | *Invalid email or password.* |
| 6 | Sign in with an unregistered email | The identical message — accounts cannot be enumerated |
| 7 | Sign out, then open `/dashboard` directly | Redirected to the sign-in page |
| 8 | `curl http://localhost:5000/api/files` with no token | `401` with *Authentication required* |

### Upload

| # | Step | Expected |
|---|---|---|
| 9 | Upload a PDF or text file with a description | Success panel shows SHA-256, CID, transaction hash and per-stage timings |
| 10 | Check the SHA-256 against the real file | `certutil -hashfile <file> SHA256` (Windows) or `sha256sum <file>` matches exactly |
| 11 | Fetch the CID from IPFS directly | `ipfs cat <cid> > out.bin` returns **encrypted** bytes, not readable content |
| 12 | Try to upload a `.exe` | *This file type is not allowed.* |
| 13 | Try to upload a file over 10 MB | *File is too large. The maximum size is 10 MB.* |
| 14 | Open the file's detail page | Database metadata and the on-chain record shown side by side, hashes identical |

### Integrity verification

| # | Step | Expected |
|---|---|---|
| 15 | Open *Verify Integrity* and select the file | Green **Integrity verified**; stored, calculated and blockchain hashes all identical |
| 16 | Run **Replace stored content** | Warning toast; the file list shows a *Content replaced* badge |
| 17 | Verify again | Red **Integrity verification failed**; the calculated hash differs from the stored and on-chain hashes |
| 18 | Try to download it | *File integrity verification failed. The retrieved file does not match the recorded hash.* |
| 19 | **Restore original**, verify again | Green **Integrity verified** |
| 20 | Run **Replace content and database hash**, then verify | Stored hash now agrees with the calculated hash, but **the blockchain hash does not** — the change is still detected |
| 21 | Restore | Verified again |

Step 20 is the key demonstration: the blockchain catches a change that the application's own database
has been edited to hide.

### Access control

| # | Step | Expected |
|---|---|---|
| 22 | As Bob, open Alice's file id directly (`/files/<fileId>`) | *Access denied. You do not have permission to access this file.* |
| 23 | As the administrator, try to download Alice's private file | Also denied — administrators have no automatic file access |
| 24 | As Alice, *Manage access* → grant to Bob | Success message plus a transaction hash |
| 25 | As Bob, open *Shared With Me* | Alice's file is listed |
| 26 | As Bob, download it | Downloads successfully; toast reports *Integrity status: VERIFIED* |
| 27 | As Bob, try to grant access to someone else | *Access denied. Only the file owner can grant access.* |
| 28 | As Alice, revoke Bob's access | Success plus a transaction hash |
| 29 | As Bob, try to download again | `403 Access denied` |
| 30 | As Bob, check *Shared With Me* | The file is gone |

### Blockchain

| # | Step | Expected |
|---|---|---|
| 31 | Open *Blockchain* | Network connected, chain id 31337, the contract address, and a transaction table |
| 32 | Compare an upload's transaction hash with the Hardhat node output | The same hash appears in the node's terminal |
| 33 | Confirm the grant and revoke transactions are listed | Three action types visible: File uploaded, Access granted, Access revoked |
| 34 | Stop the Hardhat node and try to upload | *Blockchain transaction could not be completed.* |
| 35 | Restart the node, redeploy, upload again | Works again |

### Activity and administration

| # | Step | Expected |
|---|---|---|
| 36 | Open *Activity* as Alice | Uploads, downloads, verifications, grants and revokes listed |
| 37 | Filter by **Denied** | Bob's refused attempts appear |
| 38 | Sign in as the administrator | The Administration section appears in the sidebar |
| 39 | Open *Admin Dashboard* | Users, files, grants, transactions and integrity counters populated |
| 40 | Open *Users* | All accounts with roles and wallet addresses; no password data anywhere |
| 41 | Open *System Activity* | Every user's actions, including denials, with IP addresses |
| 42 | Open *Transactions* | Every transaction, marked read-only |
| 43 | As Alice, request `/api/admin/statistics` | `403 Access denied. Insufficient privileges.` |

### Error handling

| # | Step | Expected |
|---|---|---|
| 44 | Stop the IPFS daemon and upload | The application keeps working via the local store; the sidebar shows IPFS offline |
| 45 | Stop MongoDB and reload | The API reports a clean error, not a stack trace |
| 46 | Request `/api/files/does-not-exist` | `404 File not found.` — no internal detail |
| 47 | Trigger any 500 | Response reads *Something went wrong. Please try again.*; the detail is in the server log only |

---

## 3. Defence demonstrations

Four short demonstrations, in this order:

**1. Normal upload** — sign in, upload, point at the SHA-256, the CID and the transaction hash, then
show the same values in the Hardhat node's terminal output.

**2. Authorised retrieval** — grant Bob access, sign in as Bob, download, show
`X-Integrity-Status: VERIFIED` in the browser's network tab.

**3. Unauthorised retrieval** — revoke, attempt the download again, show the 403 and then the denied
entry in the activity log.

**4. Integrity verification** — show the three matching hashes, run *Replace content and database
hash*, verify again, and show that the blockchain hash is the only one that still disagrees, and that
the download is refused because of it.
