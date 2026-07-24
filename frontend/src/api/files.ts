import client from "./client";
import { useAuthStore } from "../store/authStore";

export interface SpaceFileMeta {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  uploaded_at: string;
}

export const listSpaceFiles = (spaceId: number): Promise<SpaceFileMeta[]> =>
  client.get<SpaceFileMeta[]>(`/spaces/${spaceId}/files`).then((r) => r.data);

export const uploadSpaceFile = (
  spaceId: number,
  file: File
): Promise<SpaceFileMeta> => {
  const fd = new FormData();
  fd.append("file", file);
  return client
    .post<SpaceFileMeta>(`/spaces/${spaceId}/files`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const deleteSpaceFile = (fileId: number): Promise<void> =>
  client.delete(`/files/${fileId}`).then(() => undefined);

/** Direct URL for viewing/embedding a stored file (PDF iframe, download link).
 *  Iframes can't send Authorization headers, so the token rides as a query param —
 *  the backend accepts it for this endpoint only. */
export const fileUrl = (fileId: number): string => {
  const token = useAuthStore.getState().token ?? "";
  return `/api/files/${fileId}?token=${encodeURIComponent(token)}`;
};

/** Fetch a file as a Blob (used for Excel parsing with SheetJS). */
export const fetchFileBlob = (fileId: number): Promise<Blob> =>
  client
    .get(`/files/${fileId}`, { responseType: "blob" })
    .then((r) => r.data as Blob);
