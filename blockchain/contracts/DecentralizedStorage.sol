// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DecentralizedStorage
 * @notice Stores file *metadata* and access permissions on-chain.
 *
 * SECURITY / DESIGN NOTES
 * -----------------------
 * 1. The actual file is NEVER stored on the blockchain. Files are encrypted and
 *    pushed to IPFS (off-chain). Only the IPFS CID, the SHA-256 hash of the
 *    original file, the owner and a timestamp are written here.
 *    Reason: on-chain storage is expensive and public. Keeping only a reference
 *    plus a hash gives us tamper-evidence without leaking or bloating data.
 *
 * 2. Because blockchain records are append-only, the `fileHash` recorded here
 *    becomes an independent source of truth. If someone later modifies the file
 *    (or swaps the IPFS content, or edits the application database), the hash
 *    recomputed at download time will no longer match this on-chain value and
 *    integrity verification fails.
 *
 * 3. Access control is enforced by the contract itself: only the recorded owner
 *    of a file can grant or revoke access to that file.
 */
contract DecentralizedStorage {
    struct FileRecord {
        string fileId;      // application-level identifier (UUID from the backend)
        address owner;      // wallet address of the uploader
        string cid;         // IPFS Content Identifier of the ENCRYPTED file
        string fileHash;    // SHA-256 hash of the ORIGINAL (plaintext) file
        uint256 timestamp;  // block timestamp of the upload
        bool exists;        // guard flag: distinguishes "empty struct" from a real record
    }

    // fileId => file metadata
    mapping(string => FileRecord) private files;

    // fileId => (user address => is authorised)
    mapping(string => mapping(address => bool)) private accessList;

    // Kept so the UI can list every file recorded on-chain.
    string[] private fileIds;

    // ---------------------------------------------------------------------
    // Events. The backend reads these to build the "Blockchain Activity" page.
    // Events are the cheap, standard way for a contract to publish an audit trail.
    // ---------------------------------------------------------------------
    event FileUploaded(
        string indexed fileIdHash,
        string fileId,
        address indexed owner,
        string cid,
        string fileHash,
        uint256 timestamp
    );

    event AccessGranted(
        string indexed fileIdHash,
        string fileId,
        address indexed owner,
        address indexed grantee,
        uint256 timestamp
    );

    event AccessRevoked(
        string indexed fileIdHash,
        string fileId,
        address indexed owner,
        address indexed grantee,
        uint256 timestamp
    );

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev Only the address that originally registered the file may proceed.
    modifier onlyOwner(string memory fileId) {
        require(files[fileId].exists, "File not found");
        require(files[fileId].owner == msg.sender, "Not the file owner");
        _;
    }

    // ---------------------------------------------------------------------
    // Write operations
    // ---------------------------------------------------------------------

    /**
     * @notice Register a new file's metadata on-chain.
     * @dev Reverts if the fileId was already used, so a record can never be
     *      silently overwritten. This immutability is what makes the stored
     *      hash trustworthy for integrity checks.
     */
    function addFile(
        string memory fileId,
        string memory cid,
        string memory fileHash
    ) public {
        require(bytes(fileId).length > 0, "fileId required");
        require(bytes(cid).length > 0, "cid required");
        require(bytes(fileHash).length == 64, "fileHash must be a 64-char SHA-256 hex string");
        require(!files[fileId].exists, "File already recorded");

        files[fileId] = FileRecord({
            fileId: fileId,
            owner: msg.sender,
            cid: cid,
            fileHash: fileHash,
            timestamp: block.timestamp,
            exists: true
        });

        fileIds.push(fileId);

        // The owner always has access to their own file.
        accessList[fileId][msg.sender] = true;

        emit FileUploaded(fileId, fileId, msg.sender, cid, fileHash, block.timestamp);
    }

    /// @notice Give another address permission to read this file.
    function grantAccess(string memory fileId, address user) public onlyOwner(fileId) {
        require(user != address(0), "Invalid address");
        require(user != msg.sender, "Owner already has access");

        accessList[fileId][user] = true;
        emit AccessGranted(fileId, fileId, msg.sender, user, block.timestamp);
    }

    /// @notice Remove a previously granted permission.
    function revokeAccess(string memory fileId, address user) public onlyOwner(fileId) {
        require(accessList[fileId][user], "User does not have access");

        accessList[fileId][user] = false;
        emit AccessRevoked(fileId, fileId, msg.sender, user, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Read operations (free - they do not create a transaction)
    // ---------------------------------------------------------------------

    /// @notice Read the metadata recorded for a file.
    function getFile(string memory fileId)
        public
        view
        returns (
            string memory,
            address owner,
            string memory cid,
            string memory fileHash,
            uint256 timestamp
        )
    {
        require(files[fileId].exists, "File not found");
        FileRecord memory f = files[fileId];
        return (f.fileId, f.owner, f.cid, f.fileHash, f.timestamp);
    }

    /// @notice Check whether an address may read a file. Used by the backend
    ///         as a second, independent authorisation check.
    function hasAccess(string memory fileId, address user) public view returns (bool) {
        if (!files[fileId].exists) {
            return false;
        }
        if (files[fileId].owner == user) {
            return true;
        }
        return accessList[fileId][user];
    }

    /// @notice True if a record exists for this fileId.
    function fileExists(string memory fileId) public view returns (bool) {
        return files[fileId].exists;
    }

    /// @notice Total number of files registered on this contract.
    function getFileCount() public view returns (uint256) {
        return fileIds.length;
    }

    /// @notice fileId stored at a given index (used for simple listings).
    function getFileIdAt(uint256 index) public view returns (string memory) {
        require(index < fileIds.length, "Index out of range");
        return fileIds[index];
    }
}
