/**
 * File upload, retrieval and integrity tests.
 *
 * These cover the security core of the system: hashing before encryption,
 * encryption before storage, and the hash comparison performed on retrieval.
 */
jest.mock("../src/services/blockchainService");

const request = require("supertest");
const crypto = require("crypto");
const {
  app,
  connect,
  disconnect,
  clearAll,
  createUser,
  uploadFile,
  binaryParser
} = require("./helpers");
const File = require("../src/models/File");
const cryptoService = require("../src/services/cryptoService");
const ipfsService = require("../src/services/ipfsService");

let owner;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  await clearAll();
  owner = await createUser({ name: "File Owner", email: "owner@example.com" });
});

describe("encryption and hashing", () => {
  it("produces a stable SHA-256 hash", () => {
    const buffer = Buffer.from("integrity test");
    const expected = crypto.createHash("sha256").update(buffer).digest("hex");
    expect(cryptoService.sha256(buffer)).toBe(expected);
    expect(cryptoService.sha256(buffer)).toHaveLength(64);
  });

  it("changes the hash completely when one byte changes", () => {
    const a = cryptoService.sha256(Buffer.from("document v1"));
    const b = cryptoService.sha256(Buffer.from("document v2"));
    expect(a).not.toBe(b);
  });

  it("encrypts and decrypts back to the original bytes", () => {
    const original = Buffer.from("confidential content");
    const encrypted = cryptoService.encryptBuffer(original);

    // The ciphertext must not contain the plaintext.
    expect(encrypted.includes(original)).toBe(false);
    expect(cryptoService.decryptBuffer(encrypted).equals(original)).toBe(true);
  });

  it("uses a fresh IV, so the same file encrypts differently each time", () => {
    const original = Buffer.from("same input");
    const first = cryptoService.encryptBuffer(original);
    const second = cryptoService.encryptBuffer(original);
    expect(first.equals(second)).toBe(false);
  });

  it("refuses to decrypt data that has been modified (GCM authentication)", () => {
    const encrypted = cryptoService.encryptBuffer(Buffer.from("original"));
    encrypted[encrypted.length - 1] ^= 0xff; // flip the last byte of the ciphertext
    expect(() => cryptoService.decryptBuffer(encrypted)).toThrow();
  });
});

describe("POST /api/files/upload", () => {
  it("hashes, encrypts, stores and records a file", async () => {
    const content = "Cybersecurity research document";
    const res = await uploadFile(owner.token, { content, fileName: "research.txt" });

    expect(res.status).toBe(201);
    expect(res.body.file.sha256Hash).toBe(cryptoService.sha256(Buffer.from(content)));
    expect(res.body.file.ipfsCid).toBeTruthy();
    expect(res.body.file.blockchainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.body.performance.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("stores only ciphertext, never the plaintext", async () => {
    const content = "TOP SECRET PLAINTEXT MARKER";
    const res = await uploadFile(owner.token, { content, fileName: "secret.txt" });

    const stored = await ipfsService.fetchByCid(res.body.file.ipfsCid, res.body.file.storageBackend);
    expect(stored.buffer.includes(Buffer.from(content))).toBe(false);
    expect(cryptoService.decryptBuffer(stored.buffer).toString()).toBe(content);
  });

  it("rejects an unsupported file type", async () => {
    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("file", Buffer.from("MZ"), {
        filename: "malware.exe",
        contentType: "application/x-msdownload"
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not allowed/i);
  });

  it("rejects a file above the size limit", async () => {
    const tooBig = Buffer.alloc(11 * 1024 * 1024, "a"); // limit is 10 MB
    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${owner.token}`)
      .attach("file", tooBig, { filename: "big.txt", contentType: "text/plain" });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too large/i);
  });

  it("refuses an upload without a token", async () => {
    const res = await request(app)
      .post("/api/files/upload")
      .attach("file", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" });

    expect(res.status).toBe(401);
  });
});

describe("download and integrity verification", () => {
  it("returns the original bytes to the owner and reports VERIFIED", async () => {
    const content = "verify me";
    const upload = await uploadFile(owner.token, { content, fileName: "verify.txt" });

    const res = await request(app)
      .get(`/api/files/${upload.body.file.fileId}/download`)
      .set("Authorization", `Bearer ${owner.token}`)
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["x-integrity-status"]).toBe("VERIFIED");
    expect(res.body.toString()).toBe(content);
  });

  it("reports matching hashes across the database, the recomputed value and the chain", async () => {
    const upload = await uploadFile(owner.token, { content: "hash me", fileName: "hash.txt" });

    const res = await request(app)
      .get(`/api/files/${upload.body.file.fileId}/verify`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("VERIFIED");
    const v = res.body.verification;
    expect(v.calculatedHash).toBe(v.storedHash);
    expect(v.calculatedHash).toBe(v.blockchainHash);
    expect(v.matchesStored).toBe(true);
    expect(v.matchesBlockchain).toBe(true);
  });

  it("detects a modified file and refuses the download", async () => {
    const upload = await uploadFile(owner.token, { content: "original", fileName: "tamper.txt" });
    const fileId = upload.body.file.fileId;

    // Simulate an attacker replacing the stored content behind the application's back.
    const modified = cryptoService.encryptBuffer(Buffer.from("modified content"));
    const stored = await ipfsService.uploadBuffer(modified, "modified.enc");
    await File.updateOne({ fileId }, { ipfsCid: stored.cid, storageBackend: stored.backend });

    const verify = await request(app)
      .get(`/api/files/${fileId}/verify`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(verify.body.result).toBe("FAILED");
    expect(verify.body.verification.matchesStored).toBe(false);
    expect(verify.body.verification.matchesBlockchain).toBe(false);

    const download = await request(app)
      .get(`/api/files/${fileId}/download`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(download.status).toBe(409);
    expect(download.body.message).toMatch(/integrity verification failed/i);
  });

  it("still detects tampering when the database hash is rewritten to match", async () => {
    // This is the case only the blockchain can catch: the attacker updates the
    // stored content AND the hash held in the application database.
    const upload = await uploadFile(owner.token, { content: "original", fileName: "covered.txt" });
    const fileId = upload.body.file.fileId;

    const newContent = Buffer.from("silently replaced");
    const stored = await ipfsService.uploadBuffer(cryptoService.encryptBuffer(newContent), "x.enc");
    await File.updateOne(
      { fileId },
      {
        ipfsCid: stored.cid,
        storageBackend: stored.backend,
        sha256Hash: cryptoService.sha256(newContent)
      }
    );

    const verify = await request(app)
      .get(`/api/files/${fileId}/verify`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(verify.body.result).toBe("FAILED");
    // The database now agrees with the file...
    expect(verify.body.verification.matchesStored).toBe(true);
    // ...but the immutable on-chain record does not.
    expect(verify.body.verification.matchesBlockchain).toBe(false);
  });

  it("exposes the tamper simulation endpoint to the owner only", async () => {
    const other = await createUser({ name: "Other", email: "other@example.com" });
    const upload = await uploadFile(owner.token, { content: "abc", fileName: "sim.txt" });

    const denied = await request(app)
      .post(`/api/files/${upload.body.file.fileId}/simulate-tamper`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({ mode: "content" });

    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .post(`/api/files/${upload.body.file.fileId}/simulate-tamper`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ mode: "content" });

    expect(allowed.status).toBe(200);

    const verify = await request(app)
      .get(`/api/files/${upload.body.file.fileId}/verify`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(verify.body.result).toBe("FAILED");

    const restore = await request(app)
      .post(`/api/files/${upload.body.file.fileId}/restore`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(restore.status).toBe(200);

    const again = await request(app)
      .get(`/api/files/${upload.body.file.fileId}/verify`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(again.body.result).toBe("VERIFIED");
  });
});
