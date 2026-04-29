import { describe, expect, it } from 'vitest'
import {
  isSoleSiteAdmin,
  canManageUserPermissions,
  canAssignAdminFlag,
  canAssignTrustLevel,
} from '../src/lib/permissions'

describe('Permissions', () => {
  it('only treats the dedicated admin account as site admin', () => {
    expect(isSoleSiteAdmin({ username: 'admin', isAdmin: true, trustLevel: 0, deletedAt: null })).toBe(true)
    expect(isSoleSiteAdmin({ username: 'demo', isAdmin: true, trustLevel: 3, deletedAt: null })).toBe(false)
    expect(isSoleSiteAdmin({ username: 'writer', isAdmin: false, trustLevel: 3, deletedAt: null })).toBe(false)
    expect(isSoleSiteAdmin({ username: 'admin', isAdmin: false, trustLevel: 3, deletedAt: null })).toBe(false)
  })

  it('does not allow trust level changes to grant admin privileges', () => {
    expect(canAssignTrustLevel(1)).toBe(true)
    expect(canAssignTrustLevel(3)).toBe(true)
    expect(isSoleSiteAdmin({ username: 'writer', isAdmin: false, trustLevel: 3, deletedAt: null })).toBe(false)
  })

  it('only allows the admin account to keep the admin flag', () => {
    expect(canAssignAdminFlag('admin', true)).toBe(true)
    expect(canAssignAdminFlag('demo', true)).toBe(false)
    expect(canAssignAdminFlag('demo', false)).toBe(true)
  })

  it('does not let the sole admin demote or disable itself through user management', () => {
    expect(canManageUserPermissions({
      actorId: 'admin-id',
      targetId: 'admin-id',
      targetUsername: 'admin',
      updates: { isAdmin: false },
    })).toBe(false)

    expect(canManageUserPermissions({
      actorId: 'admin-id',
      targetId: 'admin-id',
      targetUsername: 'admin',
      updates: { deletedAt: new Date() },
    })).toBe(false)
  })
})
