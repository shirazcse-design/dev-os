import { vi } from 'vitest'

export type QueryResult<T = unknown> = { data: T; error: unknown }

/**
 * A chainable stand-in for a Supabase query builder. Every non-terminal
 * method returns the same builder so `.select().eq().eq().order()` etc. all
 * work regardless of call order; the builder itself is thenable so `await`ing
 * it directly (no `.single()`) also resolves — matching how the routes use
 * both styles (e.g. `.insert(x)` awaited directly vs. `.select().single()`).
 */
export function queryResult<T>(data: T, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  const chainable = ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete', 'upsert', 'in']
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder)
  }
  builder.single = vi.fn(() => Promise.resolve({ data, error }))
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  builder.then = (resolve: (v: QueryResult<T>) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject)
  return builder
}

export function createMockSupabase(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  }
}
