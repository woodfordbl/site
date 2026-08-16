/**
 * Generic dependency-ordering helpers shared by the per-database overlay plan
 * (`lib/databases/formula-values.ts`) and the cross-database column graph
 * (`formula-engine/graph.ts`). Pure functions over string-keyed dependency
 * maps — no formula or schema coupling, so both callers can never drift on
 * cycle naming or ordering semantics.
 */

/**
 * The dependency cycle through `start`, as keys `[start, …]`, or null when
 * `start` is not on any cycle. Depth-first over the dependency edges; bounded
 * by the (small) number of nodes.
 */
export function formulaCyclePathFrom(
  start: string,
  deps: ReadonlyMap<string, readonly string[]>
): string[] | null {
  const path: string[] = [start];
  const visited = new Set<string>([start]);
  const walk = (node: string): boolean => {
    for (const dep of deps.get(node) ?? []) {
      if (dep === start) {
        return true;
      }
      if (visited.has(dep)) {
        continue;
      }
      visited.add(dep);
      path.push(dep);
      if (walk(dep)) {
        return true;
      }
      path.pop();
    }
    return false;
  };
  return walk(start) ? path : null;
}

/** `Circular reference: Total → Subtotal → Total` (names, cycle order). */
export function formulaCycleMessage(
  path: readonly string[],
  nameOf: (key: string) => string
): string {
  const names = [...path.map(nameOf), nameOf(path[0])];
  return `Circular reference: ${names.join(" → ")}`;
}

/**
 * Kahn-style ordering: items whose dependencies are all satisfied emit
 * first; `excluded` keys (cycle members) count as already satisfied and are
 * dropped from the output. Dependencies on keys outside the item set count
 * satisfied too. Defensive tail: cycle detection covers everything reachable,
 * so the queue drains here; if it ever didn't, appending keeps every item in
 * the output (unresolved deps read as blank at evaluation).
 */
export function formulaTopoOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  depsOf: (item: T) => readonly string[],
  excluded: ReadonlySet<string>
): T[] {
  const keys = new Set(items.map(keyOf));
  const ordered: T[] = [];
  const done = new Set<string>(excluded);
  const queue = items.filter((item) => !excluded.has(keyOf(item)));
  const satisfied = (dep: string) => done.has(dep) || !keys.has(dep);
  let progress = true;
  while (progress) {
    progress = false;
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (depsOf(item).every(satisfied)) {
        ordered.push(item);
        done.add(keyOf(item));
        queue.splice(index, 1);
        index -= 1;
        progress = true;
      }
    }
  }
  return [...ordered, ...queue];
}
