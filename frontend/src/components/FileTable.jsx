import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  HashValue,
  IntegrityBadge,
  Table,
  Td,
  formatBytes,
  formatDate
} from "./ui";
import { useFileActions } from "../hooks/useFileActions";

/**
 * File listing shared by "My Files" and "Shared With Me".
 *
 * Owner-only actions are hidden here for clarity, but the server refuses them
 * regardless of what the browser shows.
 */
export default function FileTable({ files, showOwner = false, onChanged }) {
  const { download, verify, busyId } = useFileActions();

  const columns = [
    "File name",
    "Size",
    showOwner ? "Owner" : "Shared with",
    "IPFS CID",
    "Uploaded",
    "Integrity",
    "Actions"
  ];

  const handleVerify = async (file) => {
    const result = await verify(file);
    if (result && onChanged) onChanged();
  };

  return (
    <Table columns={columns}>
      {files.map((file) => (
        <tr key={file.fileId} className="transition hover:bg-slate-800/30">
          <Td>
            <Link
              to={`/files/${file.fileId}`}
              className="font-medium text-slate-100 hover:text-cyan-300"
            >
              {file.fileName}
            </Link>
            {file.description && (
              <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{file.description}</p>
            )}
            {file.tampered && (
              <span className="mt-1 inline-block">
                <Badge tone="rose">Content replaced</Badge>
              </span>
            )}
          </Td>
          <Td className="whitespace-nowrap text-slate-400">{formatBytes(file.fileSize)}</Td>
          <Td className="text-slate-400">
            {showOwner
              ? file.owner?.name ?? "—"
              : file.sharedWith > 0
                ? `${file.sharedWith} user${file.sharedWith === 1 ? "" : "s"}`
                : "Not shared"}
          </Td>
          <Td>
            <HashValue value={file.ipfsCid} tone="cyan" />
          </Td>
          <Td className="whitespace-nowrap text-slate-500">{formatDate(file.createdAt)}</Td>
          <Td>
            <IntegrityBadge result={file.lastVerificationResult} />
          </Td>
          <Td>
            <div className="flex flex-nowrap items-center gap-1.5">
              <Link to={`/files/${file.fileId}`}>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                loading={busyId === file.fileId}
                onClick={() => download(file)}
              >
                Download
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busyId === file.fileId}
                onClick={() => handleVerify(file)}
              >
                Verify
              </Button>
              {!showOwner && (
                <Link to={`/files/${file.fileId}/access`}>
                  <Button size="sm" variant="ghost" className="whitespace-nowrap">
                    Manage access
                  </Button>
                </Link>
              )}
            </div>
          </Td>
        </tr>
      ))}
    </Table>
  );
}
