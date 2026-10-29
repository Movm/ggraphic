// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The templates the organisation's owners hid. Everyone's gallery, picker and AI offers leave them
 * out; only an owner sees them (dimmed) to show them again. Designs made from a hidden template
 * are untouched.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { api } from '../api/client';
import { useLoggedIn } from '../session/SessionContext';
import { toast } from '../ui/toast';

export const hiddenTemplatesKey = (orgId: string) => ['hidden-templates', orgId] as const;

/** The hidden ids, or none when the list cannot be read: hiding is a tidy-up, not a gate. */
export async function fetchHiddenIds(orgId: string): Promise<ReadonlySet<string>> {
  try {
    return new Set(await api.listHiddenTemplates(orgId));
  } catch {
    return new Set();
  }
}

const NONE: ReadonlySet<string> = new Set();

export function useHiddenTemplates(): {
  hiddenIds: ReadonlySet<string>;
  /** Only owners may hide. */
  canHide: boolean;
  setHidden: (templateId: string, hidden: boolean) => void;
} {
  const { organisation } = useLoggedIn();
  const orgId = organisation.id;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: hiddenTemplatesKey(orgId),
    queryFn: () => api.listHiddenTemplates(orgId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      api.setTemplateHidden(orgId, id, hidden),
    onError: () => toast.error('The template could not be changed. Please try again.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: hiddenTemplatesKey(orgId) }),
  });
  const hiddenIds = useMemo(() => (query.data ? new Set(query.data) : NONE), [query.data]);
  const { mutate } = mutation;
  const setHidden = useCallback((id: string, hidden: boolean) => mutate({ id, hidden }), [mutate]);
  return { hiddenIds, canHide: organisation.role === 'owner', setHidden };
}
