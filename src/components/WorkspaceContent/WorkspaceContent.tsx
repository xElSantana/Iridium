import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import TaskBoard, { type TaskBoardLabels } from "../TaskBoard/components/TaskBoard";
import type { TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import {
  loadWorkspace,
  saveWorkspace,
  type TaskList,
  type WorkspaceData,
} from "../../features/tasks/taskStorage";
import { removeUnreferencedTaskFiles } from "../../features/tasks/taskMediaStorage";
import WorkspaceSidebar from "./WorkspaceSidebar";
import styles from "./WorkspaceContent.module.css";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface WorkspaceContentLabels {
  actionsLabel: string;
  newTaskList: string;
  defaultTaskListTitle: string;
  deleteTaskList: string;
  editTaskList: string;
  sidebarTasks: string;
  sidebarTaskLists: string;
  loadError: string;
  saveError: string;
  taskBoard: TaskBoardLabels;
}

interface Props {
  labels: WorkspaceContentLabels;
}

const emptyWorkspace: WorkspaceData = {
  version: 1,
  taskLists: [],
  selectedTaskListId: null,
};

export default function WorkspaceContent({ labels }: Props) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [storageStatus, setStorageStatus] = useState<"loading" | "ready" | "load-error">("loading");
  const [saveError, setSaveError] = useState(false);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [pendingTaskListId, setPendingTaskListId] = useState<string | null>(null);
  const [pendingTaskListsToDelete, setPendingTaskListsToDelete] = useState<string[] | null>(null);
  const workspaceRef = useRef(workspace);
  const taskDetailsOpenRef = useRef(taskDetailsOpen);
  const pendingTaskListsToDeleteRef = useRef<string[] | null>(null);
  const skipNextSave = useRef(false);
  const pendingWorkspaceSave = useRef<WorkspaceData | null>(null);
  const saveTimer = useRef<number | null>(null);
  const loadError = storageStatus === "load-error";

  const cleanupTimer = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    workspaceRef.current = workspace;
    taskDetailsOpenRef.current = taskDetailsOpen;
  }, [taskDetailsOpen, workspace]);

  const cleanupTaskFiles = useCallback((workspaceContent: WorkspaceData) => {
    void removeUnreferencedTaskFiles(workspaceContent).catch((error) => {
      console.error("Could not clean up unreferenced task files.", error);
    });
  }, []);

  const scheduleCleanupTaskFiles = useCallback((workspaceContent: WorkspaceData) => {
    if (cleanupTimer.current !== null) {
      window.clearTimeout(cleanupTimer.current);
    }
    cleanupTimer.current = window.setTimeout(() => {
      cleanupTimer.current = null;
      void removeUnreferencedTaskFiles(workspaceContent).catch((error) => {
        console.error("Could not clean up unreferenced task files.", error);
      });
    }, 10000);
  }, []);

  const flushPendingSave = useCallback(
    (notify = true) => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      const pendingWorkspace = pendingWorkspaceSave.current;
      if (!pendingWorkspace) return;

      try {
        saveWorkspace(pendingWorkspace);
        pendingWorkspaceSave.current = null;
        scheduleCleanupTaskFiles(pendingWorkspace);
        if (notify) setSaveError(false);
      } catch (error) {
        console.error("Could not save workspace task lists.", error);
        if (notify) setSaveError(true);
      }
    },
    [scheduleCleanupTaskFiles],
  );

  useIsomorphicLayoutEffect(() => {
    try {
      const loaded = loadWorkspace(labels.defaultTaskListTitle);
      setWorkspace(loaded.workspace);
      skipNextSave.current = true;
      if (loaded.migrated) {
        try {
          saveWorkspace(loaded.workspace);
          setSaveError(false);
        } catch (error) {
          console.error("Could not save migrated workspace task lists.", error);
          setSaveError(true);
        }
      }
      cleanupTaskFiles(loaded.workspace);
      setStorageStatus("ready");
    } catch (error) {
      console.error("Could not load saved workspace task lists.", error);
      setStorageStatus("load-error");
    }
  }, [cleanupTaskFiles, labels.defaultTaskListTitle]);

  useEffect(() => {
    if (storageStatus !== "ready") return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    pendingWorkspaceSave.current = workspace;
    saveTimer.current = window.setTimeout(flushPendingSave, 300);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [flushPendingSave, storageStatus, workspace]);

  useEffect(() => {
    const flushBeforeExit = () => flushPendingSave(false);
    window.addEventListener("pagehide", flushBeforeExit);
    return () => {
      window.removeEventListener("pagehide", flushBeforeExit);
      if (cleanupTimer.current !== null) {
        window.clearTimeout(cleanupTimer.current);
        cleanupTimer.current = null;
      }
      flushPendingSave(false);
    };
  }, [flushPendingSave]);

  const selectedTaskList =
    workspace.taskLists.find((taskList) => taskList.id === workspace.selectedTaskListId) ?? null;
  const selectedTaskListId = selectedTaskList?.id ?? null;

  useIsomorphicLayoutEffect(() => {
    if (storageStatus === "loading" || (storageStatus === "ready" && selectedTaskListId !== null)) {
      return;
    }

    document
      .getElementById("workspace-task-details")
      ?.closest<HTMLElement>("[data-workspace]")
      ?.removeAttribute("data-task-details-restoring");
  }, [selectedTaskListId, storageStatus]);

  const handleTasksChange = useCallback(
    (updateTasks: (tasks: TaskList["tasks"]) => TaskList["tasks"]) => {
      if (selectedTaskListId === null) return;

      setWorkspace((current) => ({
        ...current,
        taskLists: current.taskLists.map((taskList) =>
          taskList.id === selectedTaskListId
            ? { ...taskList, tasks: updateTasks(taskList.tasks) }
            : taskList,
        ),
      }));
    },
    [selectedTaskListId],
  );

  const handleBannerChange = useCallback(
    (bannerId: TaskBackgroundId | null) => {
      if (selectedTaskListId === null) return;

      setWorkspace((current) => ({
        ...current,
        taskLists: current.taskLists.map((taskList) =>
          taskList.id === selectedTaskListId ? { ...taskList, bannerId } : taskList,
        ),
      }));
    },
    [selectedTaskListId],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      if (selectedTaskListId === null) return;

      setWorkspace((current) => ({
        ...current,
        taskLists: current.taskLists.map((taskList) =>
          taskList.id === selectedTaskListId ? { ...taskList, title } : taskList,
        ),
      }));
    },
    [selectedTaskListId],
  );

  const selectTaskList = useCallback(
    (id: string) => {
      if (id === workspace.selectedTaskListId) {
        setPendingTaskListId(null);
        return;
      }

      if (taskDetailsOpen) {
        setPendingTaskListId(id);
        return;
      }

      setWorkspace((current) => ({ ...current, selectedTaskListId: id }));
    },
    [taskDetailsOpen, workspace.selectedTaskListId],
  );

  const finishTaskDetailsClose = useCallback(() => {
    setTaskDetailsOpen(false);
    if (pendingTaskListId === null && pendingTaskListsToDelete === null) return;

    setWorkspace((current) => {
      const taskLists =
        pendingTaskListsToDelete === null
          ? current.taskLists
          : current.taskLists.filter((taskList) => !pendingTaskListsToDelete.includes(taskList.id));
      const pendingTaskListExists = taskLists.some((taskList) => taskList.id === pendingTaskListId);
      const selectedTaskListExists = taskLists.some(
        (taskList) => taskList.id === current.selectedTaskListId,
      );
      let selectedTaskListId = current.selectedTaskListId;
      if (pendingTaskListExists) {
        selectedTaskListId = pendingTaskListId;
      } else if (!selectedTaskListExists) {
        selectedTaskListId = taskLists[0]?.id ?? null;
      }

      return {
        ...current,
        taskLists,
        selectedTaskListId,
      };
    });
    setPendingTaskListId(null);
    pendingTaskListsToDeleteRef.current = null;
    setPendingTaskListsToDelete(null);
  }, [pendingTaskListId, pendingTaskListsToDelete]);

  const deleteTaskLists = useCallback((idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;

    const currentWorkspace = workspaceRef.current;
    if (
      taskDetailsOpenRef.current &&
      currentWorkspace.selectedTaskListId !== null &&
      idsToDelete.includes(currentWorkspace.selectedTaskListId)
    ) {
      const deferredIds = Array.from(
        new Set([...(pendingTaskListsToDeleteRef.current ?? []), ...idsToDelete]),
      );
      pendingTaskListsToDeleteRef.current = deferredIds;
      const idsToDeleteSet = new Set(deferredIds);
      const replacementTaskListId =
        currentWorkspace.taskLists.find((taskList) => !idsToDeleteSet.has(taskList.id))?.id ?? null;
      setPendingTaskListId(replacementTaskListId);
      setPendingTaskListsToDelete(deferredIds);
      return;
    }

    setWorkspace((current) => {
      const idsToDeleteSet = new Set(idsToDelete);
      const taskLists = current.taskLists.filter((taskList) => !idsToDeleteSet.has(taskList.id));
      const selectedTaskListId = idsToDeleteSet.has(current.selectedTaskListId ?? "")
        ? (taskLists[0]?.id ?? null)
        : current.selectedTaskListId;

      return { ...current, taskLists, selectedTaskListId };
    });
  }, []);

  const deleteTaskList = useCallback(
    (id: string) => {
      deleteTaskLists([id]);
    },
    [deleteTaskLists],
  );

  const renameTaskList = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setWorkspace((current) => ({
      ...current,
      taskLists: current.taskLists.map((taskList) =>
        taskList.id === id ? { ...taskList, title: nextTitle } : taskList,
      ),
    }));
  }, []);

  const reorderTaskLists = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      setWorkspace((current) => {
        const draggedIndex = current.taskLists.findIndex((taskList) => taskList.id === draggedId);
        const targetIndex = current.taskLists.findIndex((taskList) => taskList.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return current;

        const taskLists = [...current.taskLists];
        const [draggedTaskList] = taskLists.splice(draggedIndex, 1);
        if (!draggedTaskList) return current;
        const adjustedTargetIndex = targetIndex > draggedIndex ? targetIndex - 1 : targetIndex;
        const insertAt = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
        taskLists.splice(insertAt, 0, draggedTaskList);
        return { ...current, taskLists };
      });
    },
    [],
  );

  const createTaskList = useCallback(() => {
    if (storageStatus !== "ready") return;

    const taskListId = crypto.randomUUID();

    setWorkspace((current) => {
      const baseTitle = labels.newTaskList;
      const existingTitles = new Set(current.taskLists.map((taskList) => taskList.title));
      let title = baseTitle;
      let suffix = 2;
      while (existingTitles.has(title)) {
        title = `${baseTitle} ${suffix}`;
        suffix += 1;
      }
      const taskList: TaskList = { id: taskListId, title, tasks: [] };

      return {
        ...current,
        taskLists: [...current.taskLists, taskList],
      };
    });
    selectTaskList(taskListId);
  }, [labels.newTaskList, selectTaskList, storageStatus]);

  return (
    <>
      <WorkspaceSidebar
        labels={labels}
        taskLists={workspace.taskLists}
        selectedTaskListId={workspace.selectedTaskListId}
        disabled={storageStatus !== "ready"}
        onCreateTaskList={createTaskList}
        onSelectTaskList={selectTaskList}
        onDeleteTaskList={deleteTaskList}
        onDeleteTaskLists={deleteTaskLists}
        onRenameTaskList={renameTaskList}
        onReorderTaskLists={reorderTaskLists}
      />
      {storageStatus === "loading" ? null : loadError ? (
        <p className={styles.error} role="alert">
          {labels.loadError}
        </p>
      ) : (
        <>
          {saveError && (
            <p className={styles.error} role="alert">
              {labels.saveError}
            </p>
          )}
          {selectedTaskList ? (
            <TaskBoard
              key={selectedTaskList.id}
              taskListId={selectedTaskList.id}
              title={selectedTaskList.title}
              tasks={selectedTaskList.tasks}
              bannerId={selectedTaskList.bannerId ?? null}
              labels={labels.taskBoard}
              closeTaskDetailsRequest={
                pendingTaskListId !== null || pendingTaskListsToDelete !== null
              }
              onTasksChange={handleTasksChange}
              onTitleChange={handleTitleChange}
              onBannerChange={handleBannerChange}
              onTaskDetailsOpenChange={setTaskDetailsOpen}
              onTaskDetailsClosed={finishTaskDetailsClose}
            />
          ) : null}
        </>
      )}
    </>
  );
}
