import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { accessMode } from "@/src/api/accessMode";
import { pushRecent } from "@/src/lib/recentCategories";
import { activeBudgetId, subscribeActiveBudget } from "@/src/lib/activeBudget";

const KEY = "mc-recent-categories";

/**
 * Device-local "most recently used" category list, shown above the grouped
 * list in `CategoryPickerSheet`. Same persist/hydrate/logout-clear shape as
 * `useCollapsedGroups` — a UI preference, not account data, so it lives in
 * SecureStore next to the other device prefs rather than the encrypted
 * category cache.
 */
export function useRecentCategories() {
  // One list per budget: another budget's categories mostly don't exist here.
  // The personal budget keeps the original key.
  const spaceId = useSyncExternalStore(subscribeActiveBudget, activeBudgetId);
  const key = spaceId ? `${KEY}-${spaceId}` : KEY;
  // Tagged with its budget, so a switch never shows the last budget's list.
  const [stored, setStored] = useState<{ key: string; list: string[] }>({ key, list: [] });
  const recents = stored.key === key ? stored.list : [];
  // Nothing is written until the stored value has landed — the initial empty
  // list would otherwise overwrite it on every mount.
  const hydrated = useRef(false);

  useEffect(() => {
    // A read for the budget just left can land after this one's.
    let current = true;
    hydrated.current = false;
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (current && raw) setStored({ key, list: JSON.parse(raw) as string[] });
      })
      .catch(() => {})
      .finally(() => {
        if (current) hydrated.current = true;
      });

    // Otherwise the next account signed into on this device inherits the
    // previous one's recently-used categories.
    const unsubscribe = accessMode.subscribeLogout(() => {
      hydrated.current = false;
      setStored({ key, list: [] });
      SecureStore.deleteItemAsync(key).catch(() => {});
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [key]);

  function record(name: string) {
    setStored((prev) => {
      const next = pushRecent(prev.key === key ? prev.list : [], name);
      if (hydrated.current) {
        SecureStore.setItemAsync(key, JSON.stringify(next)).catch(() => {});
      }
      return { key, list: next };
    });
  }

  return { recents, record };
}
