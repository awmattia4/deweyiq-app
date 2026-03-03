# Deferred Items — Phase 01-foundation

Items discovered during execution that are out-of-scope for the current task but should be addressed.

---

## TypeScript Error: `src/lib/db/index.ts` line 60 — PgTransaction cast

**Discovered during:** Plan 04, Task 2 TypeScript check
**File:** `src/lib/db/index.ts`
**Error:**
```
error TS2352: Conversion of type 'PgTransaction<...>' to type 'PostgresJsDatabase<...> & { $client: Sql<{}>; }'
may be a mistake because neither type sufficiently overlaps with the other.
Property '$client' is missing in type 'PgTransaction<...>'
```
**Root cause:** `tx as typeof adminDb` cast on line 60 is invalid — `PgTransaction` does not have `$client`. This was introduced in Plan 02 (database schema).
**Suggested fix:** Change `return fn(tx as typeof adminDb)` to `return fn(tx as unknown as typeof adminDb)` to explicitly acknowledge the intentional cast.
**Impact:** Does not affect runtime behavior (Drizzle transactions have the same query API). Pure TypeScript type issue.
**Fix in:** Plan 02 (origin of the code) or a dedicated cleanup pass.
