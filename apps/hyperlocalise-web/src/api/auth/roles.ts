export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}
