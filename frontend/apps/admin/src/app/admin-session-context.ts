import { createContext, useContext } from "react";

import type { AdminSession } from "@/repository/contracts";

export const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error("useAdminSession must be used inside AdminSessionBoundary.");
  return session;
}

export function adminSessionAllows(
  session: AdminSession,
  resource: string,
  action: string,
): boolean {
  return session.user.adminPermissions[resource]?.[action] === true;
}

export function useAdminPermission(resource: string, action: string): boolean {
  return adminSessionAllows(useAdminSession(), resource, action);
}
