/**
 * Access control tests.
 *
 * Covers the whole permission lifecycle: denied by default, granted by the
 * owner, usable by the grantee, revoked by the owner, and denied again.
 */
jest.mock("../src/services/blockchainService");

const request = require("supertest");
const {
  app,
  connect,
  disconnect,
  clearAll,
  createUser,
  uploadFile,
  binaryParser
} = require("./helpers");
const ActivityLog = require("../src/models/ActivityLog");
const blockchainService = require("../src/services/blockchainService");

let owner;
let grantee;
let outsider;
let admin;
let fileId;

beforeAll(connect);
afterAll(disconnect);

beforeEach(async () => {
  await clearAll();
  owner = await createUser({ name: "Owner", email: "owner@example.com" });
  grantee = await createUser({ name: "Grantee", email: "grantee@example.com" });
  outsider = await createUser({ name: "Outsider", email: "outsider@example.com" });
  admin = await createUser({ name: "Admin", email: "admin@example.com", role: "admin" });

  const upload = await uploadFile(owner.token, {
    content: "shared document",
    fileName: "shared.txt"
  });
  fileId = upload.body.file.fileId;
});

const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

describe("default state", () => {
  it("denies an unauthorised user", async () => {
    const res = await request(app).get(`/api/files/${fileId}/download`).set(auth(outsider));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      "Access denied. You do not have permission to access this file."
    );
  });

  it("denies an administrator, who has no special file access", async () => {
    const res = await request(app).get(`/api/files/${fileId}/download`).set(auth(admin));
    expect(res.status).toBe(403);
  });

  it("records the denied attempt in the audit trail", async () => {
    await request(app).get(`/api/files/${fileId}/download`).set(auth(outsider));

    const logs = await ActivityLog.find({ status: "denied" });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].fileId).toBe(fileId);
  });

  it("lets the owner download their own file", async () => {
    const res = await request(app).get(`/api/files/${fileId}/download`).set(auth(owner));
    expect(res.status).toBe(200);
  });
});

describe("granting access", () => {
  it("lets the owner grant access and records a transaction", async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.transaction.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await blockchainService.hasAccess(fileId, grantee.user.walletAddress)).toBe(true);
  });

  it("lets the grantee download the file afterwards", async () => {
    await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    const res = await request(app)
      .get(`/api/files/${fileId}/download`)
      .set(auth(grantee))
      .buffer()
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["x-integrity-status"]).toBe("VERIFIED");
    expect(res.body.toString()).toBe("shared document");
  });

  it("shows the file under Shared With Me", async () => {
    await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    const res = await request(app).get("/api/files/shared").set(auth(grantee));
    expect(res.body.files.map((f) => f.fileId)).toContain(fileId);
  });

  it("stops a non-owner from granting access", async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(grantee))
      .send({ email: "outsider@example.com" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only the file owner/i);
  });

  it("rejects a grant to an unknown email address", async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(404);
  });

  it("rejects a duplicate grant", async () => {
    await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    const res = await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    expect(res.status).toBe(409);
  });
});

describe("revoking access", () => {
  beforeEach(async () => {
    await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });
  });

  it("lets the owner revoke access", async () => {
    const res = await request(app)
      .delete(`/api/files/${fileId}/revoke/${grantee.user.id}`)
      .set(auth(owner));

    expect(res.status).toBe(200);
    expect(res.body.transaction.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await blockchainService.hasAccess(fileId, grantee.user.walletAddress)).toBe(false);
  });

  it("stops the revoked user from downloading the file", async () => {
    await request(app).delete(`/api/files/${fileId}/revoke/${grantee.user.id}`).set(auth(owner));

    const res = await request(app).get(`/api/files/${fileId}/download`).set(auth(grantee));
    expect(res.status).toBe(403);
  });

  it("removes the file from Shared With Me", async () => {
    await request(app).delete(`/api/files/${fileId}/revoke/${grantee.user.id}`).set(auth(owner));

    const res = await request(app).get("/api/files/shared").set(auth(grantee));
    expect(res.body.files).toEqual([]);
  });

  it("stops a non-owner from revoking access", async () => {
    const res = await request(app)
      .delete(`/api/files/${fileId}/revoke/${grantee.user.id}`)
      .set(auth(outsider));

    expect(res.status).toBe(403);
  });
});

describe("permission listing", () => {
  it("is available to the owner only", async () => {
    await request(app)
      .post(`/api/files/${fileId}/grant`)
      .set(auth(owner))
      .send({ email: "grantee@example.com" });

    const ownerView = await request(app).get(`/api/files/${fileId}/permissions`).set(auth(owner));
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.permissions).toHaveLength(1);
    expect(ownerView.body.permissions[0].email).toBe("grantee@example.com");

    const granteeView = await request(app)
      .get(`/api/files/${fileId}/permissions`)
      .set(auth(grantee));
    expect(granteeView.status).toBe(403);
  });
});
