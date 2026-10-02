export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};
export type Company = {
  name: string;
  state: string;
  city: string;
  address: string;
  timezone: string;
};
export type Session = { user: User; company: Company };
export type Employee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountActive: boolean;
  employeeNumber: string;
  department: string;
  designation: string;
  phone: string;
  employmentType: string;
  status: string;
  joiningDate: string;
  managerId: string | null;
  managerName: string | null;
};
export type Activity = {
  id: string;
  action: string;
  details: Record<string, string>;
  createdAt: string;
  actorName: string;
};
export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  EMPLOYEE: 'Employee',
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-HRMS-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(data?.message || 'Something went wrong. Please try again.', response.status);
  return data;
}
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}
export function employeeId(number: string) {
  return `EMP-${String(number).padStart(4, '0')}`;
}
