import type {
  Bootstrap, DayPayload, MonthData, PublicBootstrap, SettingsPayload, Workspace, YearData,
} from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : typeof payload === 'string' && payload
        ? payload
        : 'Request failed.';
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const api = {
  bootstrap: () => request<Bootstrap>('/bootstrap'),
  login: (username: string, password: string) =>
    request<Bootstrap>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  setup: (data: { displayName: string; username: string; password: string; company: string }) =>
    request<Bootstrap>('/setup', { method: 'POST', body: JSON.stringify(data) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  month: (year: number, month: number) =>
    request<MonthData>(`/month?year=${year}&month=${month}`),
  year: (year: number) => request<YearData>(`/year?year=${year}`),
  saveDay: (date: string, payload: DayPayload) =>
    request<{ ok: true; date: string; month: MonthData }>(`/day/${date}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteDay: (date: string) =>
    request<{ ok: true; date: string; month: MonthData }>(`/day/${date}`, {
      method: 'DELETE',
    }),
  settings: () => request<SettingsPayload>('/settings'),
  saveSettings: (data: {
    profileName: string; company: string; dailyHours: number; workdays: number[];
  }) =>
    request<{ settings: SettingsPayload['settings']; workspace: Workspace }>(
      '/settings',
      { method: 'PUT', body: JSON.stringify(data) },
    ),
  createUser: (data: {
    displayName: string; username: string; password: string; role: 'admin' | 'viewer';
  }) =>
    request<{ users: SettingsPayload['users'] }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (id: number, data: Partial<{
    displayName: string; role: 'admin' | 'viewer'; active: boolean; password: string;
  }>) =>
    request<{ users: SettingsPayload['users'] }>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteUser: (id: number) =>
    request<{ users: SettingsPayload['users'] }>(`/users/${id}`, { method: 'DELETE' }),
  createShare: () =>
    request<{ shareToken: string; shareEnabled: boolean }>('/share', { method: 'POST' }),
  disableShare: () =>
    request<{ shareToken: string; shareEnabled: boolean }>('/share', { method: 'DELETE' }),
  publicBootstrap: (token: string) =>
    request<PublicBootstrap>(`/public/${encodeURIComponent(token)}/bootstrap`),
  publicMonth: (token: string, year: number, month: number) =>
    request<MonthData>(`/public/${encodeURIComponent(token)}/month?year=${year}&month=${month}`),
};

export function exportUrl(kind: 'xlsx' | 'pdf', year: number, month?: number): string {
  if (month) return `/api/export/month.${kind}?year=${year}&month=${month}`;
  return `/api/export/year.${kind}?year=${year}`;
}

export function publicExportUrl(
  token: string, kind: 'xlsx' | 'pdf', year: number, month: number,
): string {
  return `/api/public/${encodeURIComponent(token)}/export/month.${kind}?year=${year}&month=${month}`;
}

export function startDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
