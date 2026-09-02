import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import FileTable from "../components/FileTable";
import { Card, EmptyState, LoadingState, PageHeader } from "../components/ui";

export default function SharedWithMe() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/files/shared")
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Shared with me"
        description="Files other users have authorised you to read. Each grant is recorded on the blockchain."
      />

      <Card title={`${files.length} file${files.length === 1 ? "" : "s"}`}>
        {loading ? (
          <LoadingState label="Loading shared files" />
        ) : files.length ? (
          <FileTable files={files} showOwner onChanged={load} />
        ) : (
          <EmptyState
            title="Nothing shared with you yet"
            description="When another user grants you access to a file, it will appear here."
          />
        )}
      </Card>
    </>
  );
}
