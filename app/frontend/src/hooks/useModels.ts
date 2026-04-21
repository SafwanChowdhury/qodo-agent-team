import { useEffect, useState } from 'react';
import { useRunStore } from '@/store/runStore';
import type { Model } from '@/types';

// ---------------------------------------------------------------------------
// Grouped models — keyed by provider name
// ---------------------------------------------------------------------------
export type GroupedModels = Record<string, Model[]>;

// ---------------------------------------------------------------------------
// useModels — fetches /api/models on mount, stores in Zustand, returns
// { models, groupedModels, loading, error }
// ---------------------------------------------------------------------------
export function useModels() {
  const setModels = useRunStore((s) => s.setModels);
  const models = useRunStore((s) => s.models);

  const [loading, setLoading] = useState(models.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If models are already loaded (e.g. from a previous mount), skip the fetch
    if (models.length > 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchModels() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/models');
        if (!res.ok) {
          throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`);
        }

        const data: Model[] = await res.json();

        if (!cancelled) {
          setModels(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load models');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchModels();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group models by provider for use in <SelectGroup> dropdowns
  const groupedModels: GroupedModels = models.reduce<GroupedModels>((acc, model) => {
    const provider = model.provider || 'Other';
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {});

  return { models, groupedModels, loading, error };
}
