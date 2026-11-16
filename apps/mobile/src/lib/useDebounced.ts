import { useEffect, useState } from "react";

/**
 * Debounced mirror of a value.
 *
 * Used for the Discover search box: the input stays instant (it renders from
 * local state) while the query key — and therefore the network request — only
 * moves once typing pauses. Without this, every keystroke spawns a request and
 * the feed flickers through partial result sets.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
