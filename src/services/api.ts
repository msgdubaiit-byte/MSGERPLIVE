// Production REST API Client for MSG Oilfield Equipment Trading LLC ERP

const TOKEN_KEY = 'msg_auth_token'

export function getAuthToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function clearAuthToken(): void {
  setAuthToken(null)
}

function buildHeaders(extra?: Record<string, string>, isFormData = false): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (extra) {
    Object.assign(headers, extra)
  }
  return headers
}

async function handleResponse<T>(resp: Response): Promise<T> {
  const text = await resp.text()
  let parsed: any = {}
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { message: text }
    }
  }
  if (!resp.ok) {
    const msg = parsed?.detail || parsed?.message || parsed?.error || `HTTP ${resp.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return parsed as T
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const resp = await fetch(path, {
    method: 'GET',
    headers: buildHeaders(),
  })
  return handleResponse<T>(resp)
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(resp)
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  const resp = await fetch(path, {
    method: 'PUT',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(resp)
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const resp = await fetch(path, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(resp)
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const resp = await fetch(path, {
    method: 'DELETE',
    headers: buildHeaders(),
  })
  return handleResponse<T>(resp)
}

export async function apiUpload<T = any>(
  path: string,
  file: File | Blob | Uint8Array,
  fileName: string,
  extraFields?: Record<string, string>
): Promise<T> {
  const form = new FormData()
  const blob =
    file instanceof Uint8Array
      ? new Blob([file as any], { type: 'application/pdf' })
      : file
  form.append('file', blob, fileName)
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        form.append(k, String(v))
      }
    })
  }
  const resp = await fetch(path, {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: form,
  })
  return handleResponse<T>(resp)
}

export async function apiDownloadBlob(path: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<Blob> {
  const resp = await fetch(path, {
    method,
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status})`)
  }
  return resp.blob()
}
