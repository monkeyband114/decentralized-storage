const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Smart contract unit tests.
 * These prove the on-chain half of the security model:
 *   - metadata is recorded and immutable
 *   - only the owner may grant/revoke access
 *   - hasAccess() reflects the current permission state
 */
describe("DecentralizedStorage", function () {
  let contract, owner, userA, userB;

  const FILE_ID = "file-0001";
  const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
  const HASH = "a".repeat(64); // stand-in for a SHA-256 hex digest

  beforeEach(async function () {
    [owner, userA, userB] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DecentralizedStorage");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("addFile", function () {
    it("records file metadata and emits FileUploaded", async function () {
      await expect(contract.addFile(FILE_ID, CID, HASH))
        .to.emit(contract, "FileUploaded");

      const [fileId, fileOwner, cid, fileHash, timestamp] = await contract.getFile(FILE_ID);
      expect(fileId).to.equal(FILE_ID);
      expect(fileOwner).to.equal(owner.address);
      expect(cid).to.equal(CID);
      expect(fileHash).to.equal(HASH);
      expect(timestamp).to.be.greaterThan(0n);
    });

    it("rejects a hash that is not 64 hex characters", async function () {
      await expect(contract.addFile(FILE_ID, CID, "tooshort"))
        .to.be.revertedWith("fileHash must be a 64-char SHA-256 hex string");
    });

    it("refuses to overwrite an existing record (append-only)", async function () {
      await contract.addFile(FILE_ID, CID, HASH);
      await expect(contract.addFile(FILE_ID, CID, "b".repeat(64)))
        .to.be.revertedWith("File already recorded");
    });

    it("gives the uploader access to their own file", async function () {
      await contract.addFile(FILE_ID, CID, HASH);
      expect(await contract.hasAccess(FILE_ID, owner.address)).to.equal(true);
    });

    it("counts registered files", async function () {
      await contract.addFile(FILE_ID, CID, HASH);
      await contract.addFile("file-0002", CID, HASH);
      expect(await contract.getFileCount()).to.equal(2n);
      expect(await contract.getFileIdAt(1)).to.equal("file-0002");
    });
  });

  describe("access control", function () {
    beforeEach(async function () {
      await contract.addFile(FILE_ID, CID, HASH);
    });

    it("denies access to an unrelated user by default", async function () {
      expect(await contract.hasAccess(FILE_ID, userA.address)).to.equal(false);
    });

    it("lets the owner grant access", async function () {
      await expect(contract.grantAccess(FILE_ID, userA.address))
        .to.emit(contract, "AccessGranted");
      expect(await contract.hasAccess(FILE_ID, userA.address)).to.equal(true);
    });

    it("lets the owner revoke access", async function () {
      await contract.grantAccess(FILE_ID, userA.address);
      await expect(contract.revokeAccess(FILE_ID, userA.address))
        .to.emit(contract, "AccessRevoked");
      expect(await contract.hasAccess(FILE_ID, userA.address)).to.equal(false);
    });

    it("stops a non-owner from granting access", async function () {
      await expect(contract.connect(userA).grantAccess(FILE_ID, userB.address))
        .to.be.revertedWith("Not the file owner");
    });

    it("stops a non-owner from revoking access", async function () {
      await contract.grantAccess(FILE_ID, userA.address);
      await expect(contract.connect(userB).revokeAccess(FILE_ID, userA.address))
        .to.be.revertedWith("Not the file owner");
    });

    it("cannot revoke access that was never granted", async function () {
      await expect(contract.revokeAccess(FILE_ID, userB.address))
        .to.be.revertedWith("User does not have access");
    });
  });

  describe("getFile", function () {
    it("reverts for an unknown file", async function () {
      await expect(contract.getFile("does-not-exist")).to.be.revertedWith("File not found");
    });

    it("reports existence correctly", async function () {
      expect(await contract.fileExists(FILE_ID)).to.equal(false);
      await contract.addFile(FILE_ID, CID, HASH);
      expect(await contract.fileExists(FILE_ID)).to.equal(true);
    });
  });
});
