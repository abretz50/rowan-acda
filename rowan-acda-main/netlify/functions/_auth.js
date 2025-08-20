// netlify/functions/_auth.js
export function requireUser(context) {
  const user = context.clientContext && context.clientContext.user;
  if (!user) { const e = new Error("Not logged in"); e.statusCode = 401; throw e; }
  return user;
}

export function requireRole(context, allowed = []) {
  const user = requireUser(context);
  // Roles come from Netlify Identity JWT
  const roles =
    user.app_metadata?.roles ||
    user["https://tokens.netlify.com/roles"] ||
    [];
  const ok = roles.some(r => allowed.includes(r));
  if (!ok) { const e = new Error("Insufficient permissions"); e.statusCode = 403; throw e; }
  return { user, roles };
}
