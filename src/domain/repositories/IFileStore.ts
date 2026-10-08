/**
 * Where videos and their working files live. Keys look like `<userId>/<jobId>/audio.mp3`.
 * On Vercel this is private Blob storage; locally it can be the uploads folder.
 * Processing code works on local files: `fetch` gives a local copy, `save` stores one.
 */
export interface IFileStore {
  /** Local path of the file (downloaded to a temp folder when stored remotely). */
  fetch(key: string): Promise<string>;
  /** Store a local file under `key`. */
  save(key: string, localPath: string, contentType?: string): Promise<void>;
  saveText(key: string, text: string): Promise<void>;
  readText(key: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
  /** Stream to the browser, honouring an HTTP Range header. */
  stream(key: string, range?: string | null): Promise<StoredStream | null>;
  /** Delete everything under a folder prefix (e.g. `<userId>/<jobId>/`). */
  deletePrefix(prefix: string): Promise<void>;
  /** Folder-like prefixes directly under `prefix` with the newest change time, for cleanup. */
  listFolders(prefix: string): Promise<{ prefix: string; updatedAt: Date }[]>;
  /** Temp working folder for a job on this machine. */
  workDir(jobKey: string): string;
}

export interface StoredStream {
  status: 200 | 206;
  body: ReadableStream;
  size: number;
  contentType: string;
  contentRange?: string;
  contentLength: number;
}
