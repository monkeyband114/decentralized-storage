# Performance evaluation

The project report identifies authentication speed, file upload time, retrieval latency, blockchain
transaction execution time and metadata synchronisation efficiency as the metrics to evaluate. This
document records a measured run and interprets it.

---

## How to reproduce

With MongoDB, the IPFS daemon, the Hardhat node and the API all running:

```bash
cd backend
npm run performance -- --runs 3
```

The script signs in, then for each file size uploads, downloads and verifies a file the given number
of times. It reports the **median** of each measurement, so a single slow run cannot skew a row, and
writes `docs/performance-results.csv`.

The upload figures are broken down by stage using the timings the API returns, so hashing,
encryption, IPFS and the blockchain transaction can be compared directly.

---

## Recorded results

Environment: Windows 11, Node.js 24, MongoDB 7 in Docker, IPFS Kubo 0.23.0 and the Hardhat network
both on localhost. Three runs per size, median values, all times in milliseconds.

| File size | Upload total | Hash | Encrypt | IPFS upload | Blockchain tx | Retrieval | Verification |
|---|---|---|---|---|---|---|---|
| 100 KB | 309 | 0 | 1 | 68 | 211 | 103 | 97 |
| 500 KB | 325 | 1 | 1 | 74 | 218 | 106 | 111 |
| 1 MB | 346 | 2 | 3 | 117 | 202 | 146 | 112 |
| 5 MB | 549 | 7 | 16 | 264 | 197 | 255 | 192 |
| 10 MB | 625 | 15 | 25 | 293 | 212 | 399 | 309 |

**Authentication time: 221 ms** (median of three sign-ins).

---

## Interpretation

**Authentication (~221 ms).** Almost all of this is bcrypt. At a cost factor of 10 the hash
comparison is deliberately expensive — that slowness is the defence against offline password
guessing, so it is a cost worth paying. Raising `BCRYPT_ROUNDS` would increase both the security
margin and this figure; each extra round roughly doubles it.

**Hashing (0–15 ms).** SHA-256 is essentially free at these sizes. Even at 10 MB it is 15 ms, about
2% of the upload. Integrity protection costs almost nothing.

**Encryption (1–25 ms).** AES-256-GCM is hardware-accelerated on modern CPUs. At 10 MB it adds 25 ms —
around 4% of the upload. Confidentiality is likewise close to free.

**IPFS upload (68–293 ms).** This grows with file size, as expected, but sub-linearly: a hundredfold
increase in size costs about four times the transfer time, because a fixed per-request overhead
dominates at small sizes. These figures are for a node on localhost; a remote node or a pinning
service would add real network latency.

**Blockchain transaction (~200 ms, flat).** The most important row in the table. The transaction time
does not change with file size — 211 ms at 100 KB and 212 ms at 10 MB — because **the file is not on
the chain**. Only the CID, the hash, the owner and a timestamp are, and those are the same size for
every file. This is the direct, measurable justification for the report's off-chain storage design:
putting the file itself on-chain would make transaction time and cost scale with file size, and would
publish the content besides.

At roughly 200 ms this is also the single largest component of an upload for files up to about 5 MB.
On a local network that time is block production; on a public network it would be considerably
longer, and would be the main constraint on throughput.

**Retrieval (103–399 ms).** Covers fetching the encrypted bytes from IPFS, decrypting them,
recomputing the hash, comparing it with the on-chain record, and returning the file. It scales with
size, dominated by the IPFS fetch and the transfer itself.

**Verification (97–309 ms).** The same pipeline without returning the file. It stays below retrieval
at every size, which is what makes a standalone verification page practical: a user can confirm a
file is intact without downloading it.

---

## Summary

| Metric | Result |
|---|---|
| Authentication | ~221 ms, dominated by bcrypt (an intentional cost) |
| Upload, 100 KB | ~309 ms end to end |
| Upload, 10 MB | ~625 ms end to end |
| Blockchain transaction | ~200 ms, constant regardless of file size |
| Retrieval, 10 MB | ~399 ms including full integrity verification |
| Integrity verification, 10 MB | ~309 ms |
| Security overhead (hash + encrypt) | under 7% of upload time at every size tested |

Two conclusions follow directly from the numbers:

1. **The security mechanisms are cheap.** Hashing and encryption together account for less than 7% of
   upload time even at 10 MB. There is no performance argument for omitting them.
2. **Keeping files off-chain is what makes the design viable.** Blockchain transaction time is
   constant because only fixed-size metadata is recorded. This is the property that lets the system
   scale to large files while retaining tamper-evidence.

---

## Notes and limitations

- Every component runs on one machine, so these are best-case latencies. A production deployment with
  a remote IPFS node and a public blockchain would be substantially slower, particularly for the
  transaction, which would be bounded by the network's block time.
- Three runs per size gives an indicative median, not a statistically rigorous result. Increase it
  with `--runs 10` for a tighter figure.
- Measurements were taken with an otherwise idle machine. Background load will move these numbers.
- The raw output of the most recent run is in `performance-results.csv`.
