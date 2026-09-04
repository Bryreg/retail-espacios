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

/**
 * `uso: "cara"` DECLARA esta imagen como la cara vigente del espacio (Fase 3,
 * fix H8): la que pinta el 3D (`getFaceImages`) y la única imagen que el rol
 * `worker` puede ver de este espacio, aparte de sus propias fotos de montaje.
 * Ya no se infiere de "la imagen más reciente" — hay que declararla a
 * propósito. Sin `uso`, el archivo se sube como documento normal y el worker
 * no lo ve.
 */
export const uploadSpaceFile = (
  spaceId: number,
  file: File,
  uso?: "cara"
): Promise<SpaceFileMeta> => {
  const fd = new FormData();
  fd.append("file", file);
  if (uso) fd.append("uso", uso);
  return client
    .post<SpaceFileMeta>(`/spaces/${spaceId}/files`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const deleteSpaceFile = (fileId: number): Promise<void> =>
  client.delete(`/files/${fileId}`).then(() => undefined);

export interface SpaceFaceImage {
  code: string;
  file_id: number;
}

/** Latest image per space (spaces with ≥1 image only) — for painting faces on the plan. */
export const getFaceImages = (): Promise<SpaceFaceImage[]> =>
  client.get<SpaceFaceImage[]>("/spaces/face-images").then((r) => r.data);

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
