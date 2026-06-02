/**
 * Thin pCloud HTTP API client.
 *
 * We deliberately avoid the heavyweight `pcloud-sdk-js` dependency and talk to
 * the documented HTTP API (https://docs.pcloud.com) with global fetch. Every
 * call is wrapped in structured logging so a failure can be diagnosed purely
 * from logs (implementation stance: observability first).
 *
 * pCloud responses are JSON with a numeric `result` (0 = success). Any non-zero
 * result is turned into a PCloudError carrying the upstream code + message.
 */

import { timed, logger } from "../logger";

export class PCloudError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly method: string,
  ) {
    super(message);
    this.name = "PCloudError";
  }
}

export interface PCloudFileMeta {
  fileid: number;
  name: string;
  size?: number;
  contenttype?: string;
}

export interface PCloudClientConfig {
  /** "us" -> api.pcloud.com, "eu" -> eapi.pcloud.com */
  region?: string;
  accessToken?: string;
  username?: string;
  password?: string;
}

function apiBase(region: string | undefined): string {
  return (region || "eu").toLowerCase() === "us"
    ? "https://api.pcloud.com"
    : "https://eapi.pcloud.com";
}

export class PCloudClient {
  private readonly base: string;
  private readonly accessToken?: string;
  private readonly username?: string;
  private readonly password?: string;
  private authPromise?: Promise<string>;

  constructor(config: PCloudClientConfig) {
    this.base = apiBase(config.region);
    this.accessToken = config.accessToken;
    this.username = config.username;
    this.password = config.password;
  }

  /** Resolve an auth query param: prefer OAuth token, fall back to login. */
  private async authParam(): Promise<Record<string, string>> {
    if (this.accessToken) {
      return { access_token: this.accessToken };
    }
    if (this.username && this.password) {
      if (!this.authPromise) {
        this.authPromise = this.login(this.username, this.password);
      }
      return { auth: await this.authPromise };
    }
    throw new PCloudError(
      "pCloud credentials missing (set PCLOUD_ACCESS_TOKEN or PCLOUD_USERNAME/PCLOUD_PASSWORD)",
      0,
      "auth",
    );
  }

  private async login(username: string, password: string): Promise<string> {
    const url = new URL(`${this.base}/userinfo`);
    url.searchParams.set("getauth", "1");
    url.searchParams.set("logout", "1");
    url.searchParams.set("username", username);
    url.searchParams.set("password", password);

    const json = await timed("pcloud.login", { method: "userinfo" }, async () => {
      const res = await fetch(url);
      return (await res.json()) as { result: number; auth?: string; error?: string };
    });

    if (json.result !== 0 || !json.auth) {
      throw new PCloudError(json.error || "login failed", json.result, "userinfo");
    }
    return json.auth;
  }

  /** Issue a GET request to a pCloud method that returns JSON. */
  private async getJson<T = Record<string, unknown>>(
    method: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${this.base}/${method}`);
    const auth = await this.authParam();
    for (const [key, value] of Object.entries({ ...params, ...auth })) {
      url.searchParams.set(key, String(value));
    }

    return timed("pcloud.call", { method, params: redact(params) }, async () => {
      const res = await fetch(url);
      const json = (await res.json()) as { result: number; error?: string } & T;
      if (json.result !== 0) {
        throw new PCloudError(json.error || `result ${json.result}`, json.result, method);
      }
      return json;
    });
  }

  /** Ensure a folder path exists, returning its folderid. */
  async ensureFolder(path: string): Promise<number> {
    const json = await this.getJson<{ metadata: { folderid: number } }>(
      "createfolderifnotexists",
      { path },
    );
    return json.metadata.folderid;
  }

  /**
   * Upload (or overwrite) a file at folderPath/fileName. pCloud keeps the
   * previous content as a revision, so an overwrite is recoverable — this is
   * our safety net for metadata writes.
   */
  async uploadFile(
    folderPath: string,
    fileName: string,
    data: Buffer,
    contentType: string,
  ): Promise<PCloudFileMeta> {
    const url = new URL(`${this.base}/uploadfile`);
    const auth = await this.authParam();
    url.searchParams.set("path", folderPath);
    url.searchParams.set("filename", fileName);
    url.searchParams.set("nopartial", "1");
    for (const [key, value] of Object.entries(auth)) {
      url.searchParams.set(key, value);
    }

    const form = new FormData();
    form.append(
      "file",
      // Wrap in a fresh Uint8Array so the Blob part type is unambiguous
      // (Buffer's backing ArrayBuffer is typed too loosely for BlobPart).
      new Blob([new Uint8Array(data)], {
        type: contentType || "application/octet-stream",
      }),
      fileName,
    );

    return timed(
      "pcloud.uploadfile",
      { folderPath, fileName, bytes: data.length },
      async () => {
        const res = await fetch(url, { method: "POST", body: form });
        const json = (await res.json()) as {
          result: number;
          error?: string;
          metadata?: PCloudFileMeta[];
        };
        if (json.result !== 0 || !json.metadata?.length) {
          throw new PCloudError(
            json.error || `upload failed (result ${json.result})`,
            json.result,
            "uploadfile",
          );
        }
        return json.metadata[0];
      },
    );
  }

  /** Look up a file's metadata by path. Returns null when it does not exist. */
  async statByPath(path: string): Promise<PCloudFileMeta | null> {
    try {
      const json = await this.getJson<{ metadata: PCloudFileMeta }>("stat", { path });
      return json.metadata;
    } catch (error) {
      // 2009 = "File not found." — an expected, non-error condition.
      if (error instanceof PCloudError && error.code === 2009) {
        return null;
      }
      throw error;
    }
  }

  /** Build a short-lived direct download URL for a file id. */
  async getFileLink(fileId: number): Promise<string> {
    const json = await this.getJson<{ hosts: string[]; path: string }>("getfilelink", {
      fileid: fileId,
    });
    if (!json.hosts?.length) {
      throw new PCloudError("getfilelink returned no hosts", 0, "getfilelink");
    }
    return `https://${json.hosts[0]}${json.path}`;
  }

  /** Fetch raw bytes of a file id (used for small metadata documents). */
  async downloadFile(fileId: number): Promise<Buffer> {
    const link = await this.getFileLink(fileId);
    return timed("pcloud.download", { fileId }, async () => {
      const res = await fetch(link);
      if (!res.ok) {
        throw new PCloudError(`download HTTP ${res.status}`, res.status, "downloadfile");
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  async deleteFile(fileId: number): Promise<void> {
    await this.getJson("deletefile", { fileid: fileId });
    logger.info("pcloud.delete.ok", { fileId });
  }
}

/** Drop anything sensitive from logged params (defensive; params are paths). */
function redact(params: Record<string, string | number>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...params };
  for (const key of ["password", "auth", "access_token"]) {
    if (key in clone) {
      clone[key] = "<redacted>";
    }
  }
  return clone;
}
