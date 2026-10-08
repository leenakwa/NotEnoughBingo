export interface UploadProgress {
  loaded: number;
  total: number | null;
}

interface UploadTransferOptions {
  method: string;
  body: XMLHttpRequestBodyInit;
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  onProgress?: (progress: UploadProgress) => void;
  withCredentials?: boolean;
  timeoutMs?: number;
}

export interface UploadTransferResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
}

const transferTimeoutMs = 120_000;

function cancellationError(): DOMException {
  return new DOMException("Upload cancelled.", "AbortError");
}

export function transferUpload(
  url: string,
  options: UploadTransferOptions,
): Promise<UploadTransferResponse> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(cancellationError());
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      xhr.upload.removeEventListener("progress", onProgress);
      xhr.removeEventListener("load", onLoad);
      xhr.removeEventListener("error", onError);
      xhr.removeEventListener("abort", onAbort);
      xhr.removeEventListener("timeout", onTimeout);
      options.signal?.removeEventListener("abort", onSignalAbort);
    };
    const succeed = (response: UploadTransferResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onProgress = (event: ProgressEvent) => {
      if (settled) return;
      try {
        options.onProgress?.({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : null,
        });
      } catch (error) {
        fail(error);
        xhr.abort();
      }
    };
    const onLoad = () => {
      try {
        if (xhr.status === 0) {
          fail(new TypeError("Unable to reach the upload service."));
          return;
        }
        const headers = new Headers();
        for (const line of xhr
          .getAllResponseHeaders()
          .trim()
          .split(/[\r\n]+/)) {
          const separator = line.indexOf(":");
          if (separator > 0) {
            headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
          }
        }
        const responseText = xhr.responseText;
        succeed({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          headers,
          json: async () => JSON.parse(responseText) as unknown,
        });
      } catch (error) {
        fail(error);
      }
    };
    const onError = () => fail(new TypeError("Unable to reach the upload service."));
    const onAbort = () => fail(cancellationError());
    const onTimeout = () => fail(new DOMException("Upload transfer timed out.", "TimeoutError"));
    const onSignalAbort = () => {
      fail(cancellationError());
      xhr.abort();
    };

    // Register before open: cross-origin uploads also require the storage CORS preflight.
    xhr.upload.addEventListener("progress", onProgress);
    xhr.addEventListener("load", onLoad);
    xhr.addEventListener("error", onError);
    xhr.addEventListener("abort", onAbort);
    xhr.addEventListener("timeout", onTimeout);
    options.signal?.addEventListener("abort", onSignalAbort, { once: true });

    try {
      xhr.open(options.method, url);
      xhr.withCredentials = options.withCredentials ?? false;
      xhr.timeout = options.timeoutMs ?? transferTimeoutMs;
      new Headers(options.headers).forEach((value, name) => xhr.setRequestHeader(name, value));
      // An abort can happen while the request is being prepared, before send.
      if (options.signal?.aborted || settled) {
        if (!settled) onSignalAbort();
        return;
      }
      xhr.send(options.body);
    } catch (error) {
      fail(error);
    }
  });
}
