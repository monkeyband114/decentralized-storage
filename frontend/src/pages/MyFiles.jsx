import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import FileTable from "../components/FileTable";
import { Button, Card, EmptyState, LoadingState, PageHeader, inputClass } from "../components/ui";

export default function MyFiles() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/files")
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = files.filter((f) =>
    (f.fileName + " " + (f.description || "")).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageHeader
        title="My files"
        description="Files you own, with their content identifiers and integrity status."
        actions={
          <Link to="/upload">
            <Button size="sm">Upload file</Button>
          </Link>
        }
      />

      <Card
        title={`${files.length} file${files.length === 1 ? "" : "s"}`}
        actions={
          <input
            className={`${inputClass} max-w-56`}
            placeholder="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        {loading ? (
          <LoadingState label="Loading files" />
        ) : filtered.length ? (
          <FileTable files={filtered} onChanged={load} />
        ) : (
          <EmptyState
            title={files.length ? "No files match your search" : "No files yet"}
            description={
              files.length
                ? "Try a different search term."
                : "Upload a file to have it hashed, encrypted and recorded on the blockchain."
            }
            action={
              !files.length && (
                <Link to="/upload">
                  <Button size="sm">Upload a file</Button>
                </Link>
              )
            }
          />
        )}
      </Card>
    </>
  );
}
