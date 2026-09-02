/**
 * Authentication tests.
 *
 * Covers: valid registration, duplicate email, valid login, invalid password,
 * password hashing, and access to a protected route without a JWT.
 */
jest.mock("../src/services/blockchainService");

const request = require("supertest");
const { app, connect, disconnect, clearAll, createUser } = require("./helpers");
const User = require("../src/models/User");

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

describe("POST /api/auth/register", () => {
  it("creates an account and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email: "new@example.com", password: "TestPass123" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("new@example.com");
    expect(res.body.user.role).toBe("user");
    expect(res.body.user.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("never stores or returns the plaintext password", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email: "hash@example.com", password: "TestPass123" });

    const user = await User.findOne({ email: "hash@example.com" });
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe("TestPass123");
    // bcrypt hashes start with $2a$ / $2b$ and are 60 characters long.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(user.toPublicJSON())).not.toContain("TestPass123");
  });

  it("rejects a duplicate email address", async () => {
    await createUser({ name: "First", email: "dup@example.com" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Second", email: "dup@example.com", password: "TestPass123" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("rejects a password that is too weak", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Weak", email: "weak@example.com", password: "abc" });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid email address", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bad", email: "not-an-email", password: "TestPass123" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await createUser({ name: "Login User", email: "login@example.com" });
  });

  it("signs in with the correct password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "TestPass123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.durationMs).toBe("number");
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "WrongPass123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });

  it("gives the same message for an unknown account, so accounts cannot be enumerated", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "TestPass123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });
});

describe("protected routes", () => {
  it("refuses a request with no token", async () => {
    const res = await request(app).get("/api/files");
    expect(res.status).toBe(401);
  });

  it("refuses a request with a forged token", async () => {
    const res = await request(app)
      .get("/api/files")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.not-a-real-signature");

    expect(res.status).toBe(401);
  });

  it("accepts a valid token", async () => {
    const { token } = await createUser({ name: "Valid", email: "valid@example.com" });
    const res = await request(app).get("/api/files").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.files).toEqual([]);
  });

  it("keeps the admin area away from ordinary users", async () => {
    const { token } = await createUser({ name: "Normal", email: "normal@example.com" });
    const res = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("lets an administrator into the admin area", async () => {
    const admin = await createUser({ name: "Admin", email: "admin@example.com", role: "admin" });
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
  });
});
