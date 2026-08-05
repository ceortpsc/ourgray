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
  ONBOARDING_READ: 'onboarding.read',
  ONBOARDING_STAGE: 'onboarding.stage',
  ONBOARDING_APPROVE: 'onboarding.approve',
  PROVISION_ENTRA: 'onboarding.provision.entra',
  PROVISION_EMAIL: 'onboarding.provision.email',
  ASSIGN_PLATFORM_ACCESS: 'onboarding.access.assign',
  ENABLE_ACCOUNT: 'onboarding.account.enable',
  DISABLE_ACCOUNT: 'onboarding.account.disable',
  ONBOARDING_EXPORT: 'onboarding.export',
  ADMIN: 'id.admin'
});

export const ROLES = Object.freeze({
  CANDIDATE: Object.freeze([PERMISSIONS.READ_OWN]),
  RECRUITER: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.ISSUE_CANDIDATE,
    PERMISSIONS.LINK,
    PERMISSIONS.ONBOARDING_READ
  ]),
  COMPLIANCE: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.ISSUE_SIGNATURE,
    PERMISSIONS.ISSUE_RETENTION,
    PERMISSIONS.CHANGE_STATUS,
    PERMISSIONS.LINK,
    PERMISSIONS.AUDIT,
    PERMISSIONS.ONBOARDING_READ
  ]),
  ETHICS: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.AUDIT,
    PERMISSIONS.ONBOARDING_READ
  ]),
  HR: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.ISSUE_CANDIDATE,
    PERMISSIONS.ISSUE_EMPLOYEE,
    PERMISSIONS.ISSUE_SIGNATURE,
    PERMISSIONS.ISSUE_RETENTION,
    PERMISSIONS.CHANGE_STATUS,
    PERMISSIONS.LINK,
    PERMISSIONS.EXPORT,
    PERMISSIONS.ONBOARDING_READ,
    PERMISSIONS.ONBOARDING_STAGE,
    PERMISSIONS.ONBOARDING_APPROVE,
    PERMISSIONS.ONBOARDING_EXPORT
  ]),
  EXECUTIVE: Object.freeze(Object.values(PERMISSIONS)),
  IT_ADMIN: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.ISSUE_EMPLOYEE,
    PERMISSIONS.ISSUE_RETENTION,
    PERMISSIONS.CHANGE_STATUS,
    PERMISSIONS.LINK,
    PERMISSIONS.EXPORT,
    PERMISSIONS.AUDIT,
    PERMISSIONS.ONBOARDING_READ,
    PERMISSIONS.PROVISION_ENTRA,
    PERMISSIONS.PROVISION_EMAIL,
    PERMISSIONS.ASSIGN_PLATFORM_ACCESS,
    PERMISSIONS.ENABLE_ACCOUNT,
    PERMISSIONS.DISABLE_ACCOUNT,
    PERMISSIONS.ONBOARDING_EXPORT
  ]),
  RECORDS_MANAGER: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.ISSUE_RETENTION,
    PERMISSIONS.CHANGE_STATUS,
    PERMISSIONS.LINK,
    PERMISSIONS.EXPORT,
    PERMISSIONS.AUDIT,
    PERMISSIONS.ONBOARDING_READ,
    PERMISSIONS.ONBOARDING_EXPORT
  ]),
  AUDITOR: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.EXPORT,
    PERMISSIONS.AUDIT,
    PERMISSIONS.ONBOARDING_READ,
    PERMISSIONS.ONBOARDING_EXPORT
  ])
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
