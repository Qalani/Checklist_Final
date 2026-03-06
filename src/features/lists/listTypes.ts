import type { List, ListItem, ListMember } from '@/types';

export type ListsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ListMemberRole = ListMember['role'];

export interface ListsState {
  status: ListsStatus;
  syncing: boolean;
  lists: List[];
  error: string | null;
}

export interface LoadMembersSuccess {
  members: ListMember[];
}

export interface ErrorResult {
  error: string;
}

export type CreateListItemInput = Partial<Pick<ListItem, 'content' | 'completed' | 'position'>>;

export interface UseListsResult extends ListsState {
  createList: (
    input: { name: string; description?: string; createdAt?: string | Date; items?: CreateListItemInput[] },
  ) => Promise<void | ErrorResult>;
  updateList: (id: string, input: { name: string; description?: string }) => Promise<void | ErrorResult>;
  deleteList: (id: string) => Promise<void | ErrorResult>;
  createListItem: (listId: string, content?: string) => Promise<{ item: ListItem } | ErrorResult>;
  updateListItem: (
    itemId: string,
    updates: { content?: string; completed?: boolean },
  ) => Promise<{ item: ListItem } | ErrorResult>;
  deleteListItem: (itemId: string) => Promise<void | ErrorResult>;
  reorderListItems: (listId: string, orderedIds: string[]) => Promise<void | ErrorResult>;
  loadMembers: (listId: string) => Promise<LoadMembersSuccess | ErrorResult>;
  inviteMember: (listId: string, email: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  updateMemberRole: (memberId: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  removeMember: (memberId: string) => Promise<void | ErrorResult>;
  enablePublicShare: (listId: string) => Promise<{ token: string } | ErrorResult>;
  rotatePublicShare: (listId: string) => Promise<{ token: string } | ErrorResult>;
  disablePublicShare: (listId: string) => Promise<void | ErrorResult>;
  archiveList: (id: string) => Promise<void | ErrorResult>;
  unarchiveList: (id: string) => Promise<void | ErrorResult>;
  refresh: (force?: boolean) => Promise<void>;
}

export interface ListMembershipRow {
  role: ListMemberRole;
  list_id: string;
  list: {
    id: string;
    name: string;
    description: string | null;
    created_at: string | null;
    user_id: string;
    archived: boolean | null;
    public_share: { token: string }[] | null;
  } | null;
}

export interface ListItemRow {
  id: string;
  list_id: string;
  content: string;
  completed: boolean;
  position: number;
  created_at: string | null;
  updated_at: string | null;
}

export function isListItemRow(value: unknown): value is ListItemRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<ListItemRow>;

  return (
    typeof record.id === 'string' &&
    typeof record.list_id === 'string' &&
    typeof record.content === 'string' &&
    typeof record.completed === 'boolean' &&
    typeof record.position === 'number'
  );
}

export function mapListItem(row: ListItemRow): ListItem {
  return {
    id: row.id,
    list_id: row.list_id,
    content: row.content,
    completed: row.completed,
    position: row.position,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  } satisfies ListItem;
}
