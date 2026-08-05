export const PERMISSIONS = Object.freeze({
  READ: 'id.read',
  READ_OWN: 'id.read.own',
  ISSUE_SIGNATURE: 'id.issue.signature',
  ISSUE_CANDIDATE: 'id.issue.candidate',
  ISSUE_EMPLOYEE: 'id.issue.employee',
  ISSUE_RETENTION: 'id.issue.retention',
  CHANGE_STATUS: 'id.status.change',
  LINK: 'id.link',
  EXPORT: 'id.export',
  AUDIT: 'id.audit.read',
  ADMIN: 'id.admin'
});

export const ROLES = Object.freeze({
  CANDIDATE: Object.freeze([PERMISSIONS.READ_OWN]),
  RECRUITER: Object.freeze([PERMISSIONS.READ, PERMISSIONS.ISSUE_CANDIDATE, PERMISSIONS.LINK]),
  COMPLIANCE: Object.freeze([PERMISSIONS.READ, PERMISSIONS.ISSUE_SIGNATURE, PERMISSIONS.ISSUE_RETENTION, PERMISSIONS.CHANGE_STATUS, PERMISSIONS.LINK, PERMISSIONS.AUDIT]),
  ETHICS: Object.freeze([PERMISSIONS.READ, PERMISSIONS.AUDIT]),
  HR: Object.freeze([PERMISSIONS.READ, PERMISSIONS.ISSUE_CANDIDATE, PERMISSIONS.ISSUE_EMPLOYEE, PERMISSIONS.ISSUE_SIGNATURE, PERMISSIONS.ISSUE_RETENTION, PERMISSIONS.CHANGE_STATUS, PERMISSIONS.LINK, PERMISSIONS.EXPORT]),
  EXECUTIVE: Object.freeze(Object.values(PERMISSIONS)),
  IT_ADMIN: Object.freeze([PERMISSIONS.READ, PERMISSIONS.ISSUE_EMPLOYEE, PERMISSIONS.ISSUE_RETENTION, PERMISSIONS.CHANGE_STATUS, PERMISSIONS.LINK, PERMISSIONS.EXPORT, PERMISSIONS.AUDIT]),
  RECORDS_MANAGER: Object.freeze([PERMISSIONS.READ, PERMISSIONS.ISSUE_RETENTION, PERMISSIONS.CHANGE_STATUS, PERMISSIONS.LINK, PERMISSIONS.EXPORT, PERMISSIONS.AUDIT]),
  AUDITOR: Object.freeze([PERMISSIONS.READ, PERMISSIONS.EXPORT, PERMISSIONS.AUDIT])
});

export function permissionsFor(role) {
  return ROLES[String(role ?? '').toUpperCase()] || [];
}

export function can(role, permission) {
  const permissions = permissionsFor(role);
  return permissions.includes(PERMISSIONS.ADMIN) || permissions.includes(permission);
}

export function requirePermission(role, permission) {
  if (!can(role, permission)) throw new Error(`Role ${role} is not authorized for ${permission}`);
  return true;
}
