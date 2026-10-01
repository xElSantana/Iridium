export const TASK_STATUSES = ["notStarted", "inProgress", "completed"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskList {
  id: string;
  title: string;
  tasks: Task[];
}

export interface WorkspaceData {
  version: 1;
  taskLists: TaskList[];
  selectedTaskListId: string | null;
}

export interface LoadedWorkspace {
  workspace: WorkspaceData;
  migrated: boolean;
}

interface LegacyTaskData {
  version: 1;
  tasks: Task[];
}

const STORAGE_KEY = "iridium.workspace.templates.v1";
const LEGACY_STORAGE_KEY = "iridium.task-list.v1";

function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.some((status) => status === value);
}

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;

  return (
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "title" in value &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    "status" in value &&
    isTaskStatus(value.status)
  );
}

function isTaskList(value: unknown): value is TaskList {
  if (typeof value !== "object" || value === null) return false;

  return (
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "title" in value &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    "tasks" in value &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isTask)
  );
}

function isWorkspaceData(value: unknown): value is WorkspaceData {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "taskLists" in value &&
    Array.isArray(value.taskLists) &&
    value.taskLists.every(isTaskList) &&
    new Set(value.taskLists.map((taskList) => taskList.id)).size === value.taskLists.length &&
    new Set(value.taskLists.flatMap((taskList) => taskList.tasks.map((task) => task.id))).size ===
      value.taskLists.reduce((count, taskList) => count + taskList.tasks.length, 0) &&
    "selectedTaskListId" in value &&
    (value.selectedTaskListId === null ||
      (typeof value.selectedTaskListId === "string" &&
        value.taskLists.some((taskList) => taskList.id === value.selectedTaskListId)))
  );
}

function isLegacyTaskData(value: unknown): value is LegacyTaskData {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "tasks" in value &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isTask) &&
    new Set(value.tasks.map((task) => task.id)).size === value.tasks.length
  );
}

export function loadWorkspace(defaultTaskListTitle: string): LoadedWorkspace {
  const savedWorkspace = localStorage.getItem(STORAGE_KEY);
  if (savedWorkspace !== null) {
    const parsedWorkspace: unknown = JSON.parse(savedWorkspace);
    if (!isWorkspaceData(parsedWorkspace)) {
      throw new Error("Saved workspace templates have an unsupported or invalid format.");
    }
    return { workspace: parsedWorkspace, migrated: false };
  }

  const legacyTasks = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyTasks === null) {
    return {
      workspace: { version: 1, taskLists: [], selectedTaskListId: null },
      migrated: false,
    };
  }

  const parsedLegacy: unknown = JSON.parse(legacyTasks);
  if (!isLegacyTaskData(parsedLegacy)) {
    throw new Error("Saved task list has an unsupported or invalid format.");
  }

  const migratedList: TaskList = {
    id: crypto.randomUUID(),
    title: defaultTaskListTitle,
    tasks: parsedLegacy.tasks,
  };

  return {
    workspace: {
      version: 1,
      taskLists: [migratedList],
      selectedTaskListId: migratedList.id,
    },
    migrated: true,
  };
}

export function saveWorkspace(workspace: WorkspaceData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}
