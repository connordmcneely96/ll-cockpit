import { describe, it, expect } from 'vitest'
import {
  systemTenantId,
  resolveTenantId,
  LIBRARY_TENANT,
  DEFAULT_TENANT,
} from './tenant'

describe('tenant resolution', () => {
  it('systemTenantId() names the standards LIBRARY partition', () => {
    expect(systemTenantId()).toBe('library:standards')
    expect(systemTenantId()).toBe(LIBRARY_TENANT)
  })

  it('the library is a DISTINCT partition from the legacy catch-all', () => {
    // The whole point of S1a: the library must never collide with 'default'.
    expect(LIBRARY_TENANT).not.toBe(DEFAULT_TENANT)
    expect(DEFAULT_TENANT).toBe('default')
  })

  it('resolveTenantId returns the authenticated user id', () => {
    expect(resolveTenantId({ userId: 'u1' })).toBe('u1')
  })

  it('resolveTenantId FAILS CLOSED — throws tenant_unresolved with no identity', () => {
    // Isolation invariant: no silent fallback to a shared partition, ever.
    expect(() => resolveTenantId({})).toThrow('tenant_unresolved')
  })
})
