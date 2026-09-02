import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useToast } from "../context/ToastContext";
import {
  Alert,
  Button,
  Card,
  Field,
  HashValue,
  PageHeader,
  formatBytes,
  inputClass
} from "../components/ui";

const MAX_MB = 10;

/**
 * The pipeline the server runs for every upload. Showing it here makes the
 * security steps visible instead of hiding them behind a progress bar.
 */
const STEPS = [
  ["Hash", "SHA-256 fingerprint of the original file"],
  ["Encrypt", "AES-256-GCM using a server-held key"],
  ["Store", "Encrypted file uploaded to IPFS"],
  ["Record", "CID and hash written to the smart contract"]
];

export default function UploadFile() {
  const toast = useToast();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState("private");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. The maximum size is ${MAX_MB} MB.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("description", description);
    formData.append("accessLevel", accessLevel);

    setUploading(true);
    setResult(null);
    try {
      const data = await api.upload("/files/upload", formData);
      setResult(data);
      toast("File encrypted, stored on IPFS and recorded on-chain.", "success");
      setFile(null);
      setDescription("");
    } catch (err) {
      setError(err.message || "Upload failed.");
      toast(err.message || "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Upload file"
        description="Files are hashed and encrypted before they reach decentralized storage."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="File details">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && <Alert type="error">{error}</Alert>}

            <Field label="File" hint={`Maximum ${MAX_MB} MB. Documents, images, archives and text files.`}>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center transition hover:border-cyan-500/50 hover:bg-slate-900/60">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError("");
                  }}
                />
                <span className="text-2xl text-slate-600">↑</span>
                {file ? (
                  <>
                    <span className="text-sm font-medium text-slate-200">{file.name}</span>
                    <span className="text-xs text-slate-500">
                      {formatBytes(file.size)} · {file.type || "unknown type"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-slate-300">Choose a file</span>
                    <span className="text-xs text-slate-500">or drop it into this area</span>
                  </>
                )}
              </label>
            </Field>

            <Field label="Description">
              <input
                className={inputClass}
                placeholder="Cybersecurity research document"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Field
              label="Access"
              hint="Both settings are enforced identically on the server; the label records your intent for the file."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["private", "Private", "Only you, until you grant access"],
                  ["restricted", "Restricted", "Intended to be shared with named users"]
                ].map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAccessLevel(value)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      accessLevel === value
                        ? "border-cyan-500/60 bg-cyan-500/10"
                        : "border-slate-700 bg-slate-950/40 hover:border-slate-600"
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-200">{label}</span>
                    <span className="block text-[11px] text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Button type="submit" loading={uploading} className="self-start">
              {uploading ? "Processing" : "Upload and record on-chain"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="What happens on upload">
            <ol className="flex flex-col gap-3">
              {STEPS.map(([name, description], index) => (
                <li key={name} className="flex gap-3">
                  <span className="mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-[11px] text-cyan-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{name}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
              The file itself is never written to the blockchain. Only its content identifier, hash,
              owner and timestamp are stored there.
            </p>
          </Card>

          {result && (
            <Card title="Upload complete">
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">File</dt>
                  <dd className="text-slate-200">{result.file.fileName}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-slate-500">SHA-256 hash</dt>
                  <dd>
                    <HashValue value={result.file.sha256Hash} tone="emerald" />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-slate-500">IPFS CID</dt>
                  <dd>
                    <HashValue value={result.file.ipfsCid} tone="cyan" />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-slate-500">Transaction</dt>
                  <dd>
                    <HashValue value={result.file.blockchainTxHash} />
                  </dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-slate-500">Timing</dt>
                  <dd className="mono text-xs text-slate-400">
                    hash {result.performance.hashMs} ms · encrypt {result.performance.encryptMs} ms ·
                    IPFS {result.performance.ipfsMs} ms · chain {result.performance.blockchainMs} ms ·
                    total {result.performance.totalMs} ms
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => navigate(`/files/${result.file.fileId}`)}>
                  View file
                </Button>
                <Link to="/files">
                  <Button size="sm" variant="secondary">
                    All files
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
