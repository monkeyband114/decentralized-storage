import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useToast } from "../context/ToastContext";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  PageHeader,
  formatBytes,
  inputClass
} from "../components/ui";

/**
 * Integrity verification.
 *
 * The server retrieves the encrypted file from IPFS, decrypts it, recomputes
 * the SHA-256 hash and compares that value with two references:
 *   - the hash stored in the application database, and
 *   - the hash recorded on the blockchain, which cannot be rewritten.
 * This page displays all three side by side so a mismatch is obvious.
 */

/** One labelled hash row, tinted to show whether it matches the calculated value. */
function HashRow({ label, value, source, state }) {
  const tones = {
    match: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    mismatch: "border-rose-500/30 bg-rose-500/5 text-rose-300",
    neutral: "border-slate-800 bg-slate-950/60 text-slate-300"
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[state]}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{source}</span>
      </div>
      <code className="mono block break-all text-xs leading-relaxed">{value || "unavailable"}</code>
    </div>
  );
}

export default function VerifyIntegrity() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [files, setFiles] = useState([]);
  const [selectedId, setSelectedId] = useState(id || "");
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmTamper, setConfirmTamper] = useState(null);
  const [busy, setBusy] = useState(false);

  // Files the user can verify: their own plus anything shared with them.
  useEffect(() => {
    Promise.all([api.get("/files"), api.get("/files/shared")])
      .then(([mine, shared]) => {
        const all = [...mine.files, ...shared.files];
        setFiles(all);
        if (!selectedId && all.length) setSelectedId(all[0].fileId);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runVerification = useCallback(
    async (fileId) => {
      if (!fileId) return;
      setRunning(true);
      setReport(null);
      try {
        const [detail, verification] = await Promise.all([
          api.get(`/files/${fileId}`),
          api.get(`/files/${fileId}/verify`)
        ]);
        setFile(detail.file);
        setReport(verification);
      } catch (err) {
        toast(err.message || "Verification failed.", "error");
        setReport(null);
      } finally {
        setRunning(false);
      }
    },
    [toast]
  );

  // Verify as soon as a file is selected, so the comparison is always on screen.
  useEffect(() => {
    if (selectedId) runVerification(selectedId);
  }, [selectedId, runVerification]);

  const applyTamper = async () => {
    setBusy(true);
    try {
      await api.post(`/files/${selectedId}/simulate-tamper`, { mode: confirmTamper });
      toast("Stored content replaced. Run verification to see the result.", "warning", 7000);
      setConfirmTamper(null);
      await runVerification(selectedId);
    } catch (err) {
      toast(err.message || "The test could not be run.", "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await api.post(`/files/${selectedId}/restore`);
      toast("Original content restored.", "success");
      await runVerification(selectedId);
    } catch (err) {
      toast(err.message || "Restore failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading files" />;

  const verification = report?.verification;
  const verified = report?.result === "VERIFIED";

  return (
    <>
      <PageHeader
        title="Verify file integrity"
        description="Recompute the hash of the stored file and compare it with the database and the blockchain."
      />

      {!files.length ? (
        <Card>
          <EmptyState
            title="No files available to verify"
            description="Upload a file first, or wait until someone shares one with you."
            action={<Button size="sm" onClick={() => navigate("/upload")}>Upload a file</Button>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card title="Select a file">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-64 flex-1">
                <span className="mb-1.5 block text-xs font-medium text-slate-300">File</span>
                <select
                  className={inputClass}
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setReport(null);
                  }}
                >
                  {files.map((f) => (
                    <option key={f.fileId} value={f.fileId}>
                      {f.fileName} ({formatBytes(f.fileSize)})
                    </option>
                  ))}
                </select>
              </label>
              <Button loading={running} onClick={() => runVerification(selectedId)}>
                Run verification
              </Button>
            </div>
          </Card>

          {running && (
            <Card>
              <LoadingState label="Retrieving from IPFS, decrypting and re-hashing" />
            </Card>
          )}

          {verification && !running && (
            <>
              {/* Verdict banner */}
              <div
                className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-6 py-5 ${
                  verified
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-rose-500/40 bg-rose-500/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full border text-2xl ${
                      verified
                        ? "border-emerald-500/50 text-emerald-300"
                        : "border-rose-500/50 text-rose-300"
                    }`}
                  >
                    {verified ? "✓" : "✕"}
                  </span>
                  <div>
                    <p
                      className={`text-lg font-semibold ${verified ? "text-emerald-200" : "text-rose-200"}`}
                    >
                      {verified ? "Integrity verified" : "Integrity verification failed"}
                    </p>
                    <p className="text-sm text-slate-400">{report.message}</p>
                  </div>
                </div>
                <div className="mono text-right text-[11px] text-slate-500">
                  <p>IPFS retrieval {verification.performance.ipfsMs} ms</p>
                  <p>decrypt {verification.performance.decryptMs} ms</p>
                  <p>hash {verification.performance.verifyMs} ms</p>
                </div>
              </div>

              <Card title={verification.fileName} subtitle="Hash comparison">
                <div className="grid gap-3 lg:grid-cols-3">
                  <HashRow
                    label="Stored hash"
                    source="Database"
                    value={verification.storedHash}
                    state={verification.matchesStored ? "match" : "mismatch"}
                  />
                  <HashRow
                    label="Calculated hash"
                    source="Recomputed now"
                    value={verification.calculatedHash}
                    state="neutral"
                  />
                  <HashRow
                    label="Blockchain hash"
                    source="Smart contract"
                    value={verification.blockchainHash}
                    state={
                      verification.matchesBlockchain === null
                        ? "neutral"
                        : verification.matchesBlockchain
                          ? "match"
                          : "mismatch"
                    }
                  />
                </div>

                <dl className="mt-5 grid gap-4 border-t border-slate-800 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">IPFS CID (current)</dt>
                    <dd className="mono mt-1 break-all text-xs text-cyan-300">
                      {verification.ipfsCid}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">IPFS CID (recorded on-chain)</dt>
                    <dd
                      className={`mono mt-1 break-all text-xs ${
                        verification.cidMatches === false ? "text-rose-300" : "text-slate-300"
                      }`}
                    >
                      {verification.blockchainCid || "unavailable"}
                    </dd>
                  </div>
                </dl>

                {verification.decryptionFailed && (
                  <div className="mt-4">
                    <Alert type="error" title="Decryption failed">
                      AES-256-GCM rejected the stored data. The ciphertext or its authentication tag
                      was modified, which is itself proof that the content changed.
                    </Alert>
                  </div>
                )}

                {verification.cidMatches === false && !verification.decryptionFailed && (
                  <div className="mt-4">
                    <Alert type="warning" title="Content identifier changed">
                      The CID this application is pointing at differs from the one recorded on the
                      blockchain, so the stored file is not the file that was originally registered.
                    </Alert>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* Security test controls - owner only */}
          {file?.isOwner && (
            <Card
              title="Tamper detection test"
              subtitle="Replace the stored content to confirm that verification detects the change"
            >
              <p className="mb-4 text-sm leading-relaxed text-slate-400">
                Content-addressed storage means the bytes behind an existing CID cannot be edited.
                What an attacker with server access could do is store different content and repoint
                the application at it. These controls reproduce exactly that, so the detection can be
                observed. The blockchain record is never altered.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={file.tampered || busy}
                  onClick={() => setConfirmTamper("content")}
                >
                  Replace stored content
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={file.tampered || busy}
                  onClick={() => setConfirmTamper("database")}
                >
                  Replace content and database hash
                </Button>
                <Button variant="ghost" size="sm" disabled={!file.tampered} loading={busy} onClick={restore}>
                  Restore original
                </Button>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                The second option also rewrites the hash held in the database, so only the immutable
                on-chain record still holds the original value. That is the case where the blockchain
                is the only thing standing between a modified file and a user who trusts it.
              </p>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTamper)}
        title="Run tamper detection test"
        message={
          confirmTamper === "database"
            ? "The stored content and the hash held in the database will both be replaced. Only the blockchain will still hold the original hash. You can restore the file afterwards."
            : "The stored content will be replaced with modified bytes. The recorded hashes stay as they are, so verification should fail. You can restore the file afterwards."
        }
        confirmLabel="Run test"
        busy={busy}
        onCancel={() => setConfirmTamper(null)}
        onConfirm={applyTamper}
      />
    </>
  );
}
