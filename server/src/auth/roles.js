// Role model: member (default) · recruiter (talent dashboard) · super_admin
// (platform console). Legacy stored values are normalized: 'user' → member,
// 'admin' → super_admin, so existing accounts keep working.

export function normalizeRole(role) {
  if (role === 'super_admin' || role === 'admin') return 'super_admin';
  if (role === 'recruiter') return 'recruiter';
  return 'member';
}

export const isSuperAdmin = (role) => normalizeRole(role) === 'super_admin';
export const isRecruiter = (role) => normalizeRole(role) === 'recruiter';
/** Recruiters and super-admins — anyone with a back-office dashboard. */
export const isStaff = (role) => {
  const r = normalizeRole(role);
  return r === 'recruiter' || r === 'super_admin';
};

export const ROLES = ['member', 'recruiter', 'super_admin'];
export const isValidRole = (r) => ROLES.includes(r);
