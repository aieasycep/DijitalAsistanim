/**
 * Google Tasks REST adapter plus normalisation to TaskDraft. The API has no sync token, so the
 * cursor is the ISO instant of the last successful sync and each run lists tasks with
 * `updatedMin` (deleted/hidden tasks included so completions and removals propagate).
 */
import { GOOGLE_SCOPES } from '../oauth/scopes';
import { encodePathSegment, providerRequest, toIsoOrNull } from './http';
import type {
  CreateTaskInput,
  CreateTaskResult,
  ProviderClientOptions,
  ProviderFetch,
  TaskDraft,
  TasksDelta,
  TasksSyncInput,
} from './types';

export const GOOGLE_TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
export const GOOGLE_DEFAULT_TASK_LIST = '@default';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_LIST = 20;

// --- Raw API shapes -------------------------------------------------------------------------------

export interface GoogleTaskList {
  id: string;
  title?: string;
  updated?: string;
}
export interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
  deleted?: boolean;
  hidden?: boolean;
  parent?: string;
  position?: string;
  webViewLink?: string;
  selfLink?: string;
}
export interface GoogleTaskListsResponse {
  items?: GoogleTaskList[];
  nextPageToken?: string;
}
export interface GoogleTasksResponse {
  items?: GoogleTask[];
  nextPageToken?: string;
}

// --- Normalisation -------------------------------------------------------------------------------

export function normalizeGoogleTask(raw: GoogleTask, opts: { listId: string }): TaskDraft {
  const completed = raw.status === 'completed';
  return {
    externalTaskId: raw.id,
    externalListId: opts.listId,
    title: raw.title?.trim() ?? '',
    notes: raw.notes ?? null,
    dueAt: toIsoOrNull(raw.due),
    status: completed ? 'completed' : 'open',
    completedAt: completed ? toIsoOrNull(raw.completed) : null,
    provider: 'google',
    priority: 'normal',
    providerUpdatedAt: toIsoOrNull(raw.updated),
    webUrl: raw.webViewLink ?? null,
  };
}

/** Google ignores the time part of `due`; send the UTC date at midnight. */
function dueDateBody(dueAt: string | null | undefined): string | undefined {
  if (!dueAt) return undefined;
  const iso = toIsoOrNull(dueAt);
  return iso ? `${iso.slice(0, 10)}T00:00:00.000Z` : undefined;
}

// --- Client -------------------------------------------------------------------------------------

export interface GoogleTasksClientOptions extends ProviderClientOptions {
  baseUrl?: string;
}

export interface GoogleTaskPatch {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  status?: 'open' | 'completed';
}

export interface GoogleTasksClient {
  listTaskLists(): Promise<GoogleTaskList[]>;
  listTasks(
    listId: string,
    input?: {
      showCompleted?: boolean;
      showHidden?: boolean;
      showDeleted?: boolean;
      updatedMin?: string | null;
      pageToken?: string | null;
      maxResults?: number;
    },
  ): Promise<GoogleTasksResponse>;
  createTask(listId: string | null | undefined, input: CreateTaskInput): Promise<CreateTaskResult>;
  patchTask(listId: string, taskId: string, patch: GoogleTaskPatch): Promise<GoogleTask>;
  syncTasks(input: TasksSyncInput): Promise<TasksDelta>;
}

export function createGoogleTasksClient(
  fetchImpl: ProviderFetch,
  accessToken: string,
  opts: GoogleTasksClientOptions = {},
): GoogleTasksClient {
  const base = opts.baseUrl ?? GOOGLE_TASKS_API_BASE;
  const timeoutMs = opts.timeoutMs;
  const readScope = GOOGLE_SCOPES.tasksReadonly;
  const writeScope = GOOGLE_SCOPES.tasks;
  const tasksUrl = (listId: string) => `${base}/lists/${encodePathSegment(listId)}/tasks`;

  const listTaskLists = async (): Promise<GoogleTaskList[]> => {
    const lists: GoogleTaskList[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_LIST; page++) {
      const result = await providerRequest<GoogleTaskListsResponse>(fetchImpl, {
        url: `${base}/users/@me/lists`,
        token: accessToken,
        timeoutMs,
        requiredScope: readScope,
        query: { maxResults: PAGE_SIZE, pageToken },
      });
      lists.push(...(result.items ?? []));
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    return lists;
  };

  const listTasks: GoogleTasksClient['listTasks'] = (listId, input = {}) =>
    providerRequest<GoogleTasksResponse>(fetchImpl, {
      url: tasksUrl(listId),
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      query: {
        showCompleted: input.showCompleted ?? true,
        showHidden: input.showHidden ?? true,
        showDeleted: input.showDeleted ?? false,
        updatedMin: input.updatedMin ?? undefined,
        pageToken: input.pageToken ?? undefined,
        maxResults: input.maxResults ?? PAGE_SIZE,
      },
    });

  const createTask: GoogleTasksClient['createTask'] = async (listId, input) => {
    const targetList = listId || input.listId || GOOGLE_DEFAULT_TASK_LIST;
    const due = dueDateBody(input.dueAt);
    const created = await providerRequest<GoogleTask>(fetchImpl, {
      url: tasksUrl(targetList),
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: writeScope,
      body: {
        title: input.title,
        ...(input.notes ? { notes: input.notes } : {}),
        ...(due ? { due } : {}),
      },
    });
    return { externalTaskId: created.id, listId: targetList };
  };

  const patchTask: GoogleTasksClient['patchTask'] = (listId, taskId, patch) =>
    providerRequest<GoogleTask>(fetchImpl, {
      url: `${tasksUrl(listId)}/${encodePathSegment(taskId)}`,
      method: 'PATCH',
      token: accessToken,
      timeoutMs,
      requiredScope: writeScope,
      body: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes ?? '' } : {}),
        ...(patch.dueAt !== undefined ? { due: dueDateBody(patch.dueAt) ?? null } : {}),
        ...(patch.status !== undefined
          ? { status: patch.status === 'completed' ? 'completed' : 'needsAction' }
          : {}),
      },
    });

  const syncTasks: GoogleTasksClient['syncTasks'] = async (input) => {
    const now = input.now ?? new Date().toISOString();
    const updatedMin = input.cursor && toIsoOrNull(input.cursor) ? toIsoOrNull(input.cursor) : null;
    const tasks: TaskDraft[] = [];
    const deleted: string[] = [];
    for (const list of await listTaskLists()) {
      let pageToken: string | null = null;
      for (let page = 0; page < MAX_PAGES_PER_LIST; page++) {
        const result: GoogleTasksResponse = await listTasks(list.id, {
          updatedMin,
          showDeleted: true,
          pageToken,
        });
        for (const raw of result.items ?? []) {
          if (raw.deleted === true) deleted.push(raw.id);
          else tasks.push(normalizeGoogleTask(raw, { listId: list.id }));
        }
        pageToken = result.nextPageToken ?? null;
        if (!pageToken) break;
      }
    }
    return {
      tasks,
      deletedExternalIds: deleted,
      nextCursor: now,
      nextPageToken: null,
      hasMore: false,
    };
  };

  return { listTaskLists, listTasks, createTask, patchTask, syncTasks };
}
