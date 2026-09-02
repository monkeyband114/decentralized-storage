import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";
import { useFileActions } from "../hooks/useFileActions";
import {
  Alert,
  Badge,
  Button,
  Card,
  IntegrityBadge,
  LoadingState,
  PageHeader,
  formatBytes,
  formatDate
} from "../components/ui";

/** Label + monospace value pair. */
function Detail({ label, value, tone = "slate", mono = true }) {
  const tones = { slate: "text-slate-200", cyan: "text-cyan-300", emerald: "text-emerald-300" };
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 break-all text-sm ${mono ? "mono text-xs" : ""} ${tones[tone]}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

export default function FileDetails() {
  const { id } = useParams();
  const { download, verify, busyId } = useFileActions();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/files/${id}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  if (loading) return <LoadingState label="Loading file" />;

  if (error) {
    return (
      <>
        <PageHeader title="File" />
        <Alert type="error" title="Unable to open this file">
          {error}
        </Alert>
        <div className="mt-4">
          <Link to="/files">
            <Button variant="secondary" size="sm">
              Back to my files
            </Button>
          </Link>
        </div>
      </>
    );
  }

  const { file, blockchainRecord } = data;

  return (
    <>
      <PageHeader
        title={file.fileName}
        description={file.description || "No description provided."}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={busyId === file.fileId}
              onClick={() => download(file)}
            >
              Download
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={busyId === file.fileId}
              onClick={async () => {
                await verify(file);
                load();
              }}
            >
              Verify
            </Button>
            {file.isOwner && (
              <Link to={`/files/${file.fileId}/access`}>
                <Button size="sm">Manage access</Button>
              </Link>
            )}
          </>
        }
      />

      {file.tampered && (
        <div className="mb-6">
          <Alert type="warning" title="Stored content has been replaced">
            A tamper detection test has been run against this file. Open{" "}
            <Link to={`/files/${file.fileId}/verify`} className="underline">
              Verify integrity
            </Link>{" "}
            to see the mismatch, or restore the original content from there.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="File metadata" subtitle="Stored in the application database">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="File identifier" value={file.fileId} />
            <Detail label="Size" value={formatBytes(file.fileSize)} mono={false} />
            <Detail label="Type" value={file.mimeType} mono={false} />
            <Detail label="Uploaded" value={formatDate(file.createdAt)} mono={false} />
            <Detail
              label="Owner"
              value={file.owner ? `${file.owner.name} (${file.owner.email})` : "You"}
              mono={false}
            />
            <div>
              <dt className="text-xs text-slate-500">Access level</dt>
              <dd className="mt-1">
                <Badge tone={file.accessLevel === "private" ? "slate" : "violet"}>
                  {file.accessLevel}
                </Badge>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <Detail label="SHA-256 hash of the original file" value={file.sha256Hash} tone="emerald" />
            </div>
            <div className="sm:col-span-2">
              <Detail label="IPFS CID of the encrypted file" value={file.ipfsCid} tone="cyan" />
            </div>
            <div>
              <dt className="text-xs text-slate-500">Storage backend</dt>
              <dd className="mt-1">
                <Badge tone={file.storageBackend === "ipfs" ? "cyan" : "amber"}>
                  {file.storageBackend === "ipfs" ? "IPFS node" : "Local store"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Last integrity check</dt>
              <dd className="mt-1 flex items-center gap-2">
                <IntegrityBadge result={file.lastVerificationResult} />
                {file.lastVerifiedAt && (
                  <span className="text-[11px] text-slate-500">
                    {formatDate(file.lastVerifiedAt)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Blockchain record"
          subtitle="Written to the smart contract and immutable"
          actions={
            <Link to="/blockchain" className="text-xs text-cyan-400 hover:text-cyan-300">
              All transactions
            </Link>
          }
        >
          {blockchainRecord ? (
            <dl className="grid gap-4">
              <Detail label="Owner address" value={blockchainRecord.owner} />
              <Detail label="Recorded hash" value={blockchainRecord.fileHash} tone="emerald" />
              <Detail label="Recorded CID" value={blockchainRecord.cid} tone="cyan" />
              <Detail
                label="Recorded at"
                value={formatDate(new Date(blockchainRecord.timestamp * 1000))}
                mono={false}
              />
              <Detail label="Transaction hash" value={file.blockchainTxHash} />
              <Detail label="Block number" value={file.blockchainBlockNumber} mono={false} />

              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  The file itself is not on the blockchain. Only this reference is, which is what
                  makes it cheap to store and impossible to alter after the fact.
                </p>
              </div>

              {blockchainRecord.fileHash !== file.sha256Hash && (
                <Alert type="error" title="Hash mismatch">
                  The hash held in the database no longer matches the hash recorded on-chain.
                </Alert>
              )}
            </dl>
          ) : (
            <Alert type="warning" title="On-chain record unavailable">
              The blockchain node could not be reached, so the recorded metadata cannot be shown
              right now.
            </Alert>
          )}
        </Card>
      </div>
    </>
  );
}
