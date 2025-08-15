// netlify/functions/_auth.js
export function requireUser(context) {
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
      const err = new Error("Not logged in");
      err.statusCode = 401;
      throw err;
    }
    return user;
  }
  
  export function requireRole(context, allowed = []) {
    const user = requireUser(context);
    const roles =
      (user.app_metadata && user.app_metadata.roles) ||
      (user["https://tokens.netlify.com/roles"]) ||
      [];
    const ok = roles.some(r => allowed.includes(r));
    if (!ok) {
      const err = new Error("Insufficient permissions");
      err.statusCode = 403;
      throw err;
    }
    return { user, roles };
  }
  