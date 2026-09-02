/**
 * Thin wrapper around fetch for talking to the Express API.
 *
 * SECURITY NOTES
 *  - The JWT is attached as an "Authorization: Bearer" header on every request.
 *  - The token is kept in localStorage. That is convenient for a single-page
 *    application, and it is the documented trade-off of this implementation:
 *    a token in localStorage is readable by any script running on the page, so
 *    the API also enforces short token lifetimes and re-checks every request
 *    server-side. Nothing here is trusted by the backend.
 *  - No encryption key or file content ever passes through this layer in
 *    plaintext form other than the file the user is uploading or downloading.
 */

const TOKEN_KEY = "dss_token";

/**
 * Where the API lives.
 *
 * Local development leaves VITE_API_URL unset, so requests go to "/api" and
 * Vite's proxy forwards them to the Express server on port 5000 - one origin,
 * no CORS involved.
 *
 * A deployed frontend sets VITE_API_URL to the API's public address (for
 * example https://securechain-api.onrender.com). The backend allows that origin
 * explicitly through its CORS configuration.
 */
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Error carrying the HTTP status so callers can react to 403 / 409 specifically. */
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = body;
  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });

  // A 401 means the session is gone; clear it so the app returns to sign-in.
  if (response.status === 401) {
    setToken(null);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: "Unexpected response from the server." };
  }

  if (!response.ok) {
    throw new ApiError(response.status, data.message || "Request failed.", data);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
  upload: (path, formData) => request(path, { method: "POST", body: formData, isFormData: true }),

  /**
   * Download a file as a binary blob. Returns the blob plus the integrity
   * status header the server attached after re-verifying the hash.
   */
  async download(path) {
    const token = getToken();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      const text = await response.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
      throw new ApiError(response.status, data.message || "Download failed.", data);
    }

    return {
      blob: await response.blob(),
      integrityStatus: response.headers.get("X-Integrity-Status"),
      fileHash: response.headers.get("X-File-Hash")
    };
  }
};

/** Trigger a browser save dialog for a downloaded blob. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
