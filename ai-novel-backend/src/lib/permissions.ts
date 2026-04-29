export const SOLE_ADMIN_USERNAME = 'admin'

export type PermissionUser = {
  username: string
  isAdmin: boolean
  trustLevel?: number | null
  deletedAt?: Date | string | null
}

export type PermissionUpdates = {
  trustLevel?: number
  isAdmin?: boolean
  deletedAt?: Date | string | null
}

export function isSoleSiteAdmin(user: PermissionUser | null | undefined): boolean {
  return !!user
    && user.username === SOLE_ADMIN_USERNAME
    && user.isAdmin === true
    && !user.deletedAt
}

export function canAssignTrustLevel(level: number): boolean {
  return Number.isInteger(level) && level >= -1 && level <= 3
}

export function canAssignAdminFlag(username: string, isAdmin: boolean): boolean {
  return isAdmin === false || username === SOLE_ADMIN_USERNAME
}

export function canManageUserPermissions(input: {
  actorId: string
  targetId: string
  targetUsername: string
  updates: PermissionUpdates
}): boolean {
  if (input.actorId === input.targetId && input.targetUsername === SOLE_ADMIN_USERNAME) {
    if (input.updates.isAdmin === false || input.updates.deletedAt) return false
  }
  if (input.updates.trustLevel !== undefined && !canAssignTrustLevel(input.updates.trustLevel)) return false
  if (input.updates.isAdmin !== undefined && !canAssignAdminFlag(input.targetUsername, input.updates.isAdmin)) return false
  return true
}
