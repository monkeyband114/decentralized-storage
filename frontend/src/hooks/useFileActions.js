/**
 * Shared download and verify actions.
 *
 * Both call the API and surface the server's verdict. The browser never decides
 * whether a file is authentic - it only displays the result the server reached
 * after re-hashing the decrypted bytes and comparing them with the blockchain.
 */
import { useState } from "react";
import { api, saveBlob } from "../services/api";
import { useToast } from "../context/ToastContext";

export function useFileActions() {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  async function download(file) {
    setBusyId(file.fileId);
    try {
      const { blob, integrityStatus } = await api.download(`/files/${file.fileId}/download`);
      saveBlob(blob, file.fileName);
      toast(`${file.fileName} downloaded. Integrity status: ${integrityStatus}.`, "success");
      return true;
    } catch (err) {
      if (err.status === 403) {
        toast("Access denied. You do not have permission to access this file.", "error");
      } else if (err.status === 409) {
        toast(
          "File integrity verification failed. The retrieved file does not match the recorded hash.",
          "error",
          8000
        );
      } else {
        toast(err.message || "Download failed.", "error");
      }
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function verify(file) {
    setBusyId(file.fileId);
    try {
      const data = await api.get(`/files/${file.fileId}/verify`);
      toast(
        data.result === "VERIFIED" ? "Integrity verified." : "Integrity verification failed.",
        data.result === "VERIFIED" ? "success" : "error",
        7000
      );
      return data;
    } catch (err) {
      toast(err.message || "Verification failed.", "error");
      return null;
    } finally {
      setBusyId(null);
    }
  }

  return { download, verify, busyId };
}
