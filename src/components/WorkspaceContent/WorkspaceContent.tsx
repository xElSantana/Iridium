import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCustomVerticalScrollbar } from "../TaskBoard/useCustomVerticalScrollbar";
import { createPortal } from "react-dom";
import { LuFilePlus, LuListTodo } from "react-icons/lu";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import TaskBoard, { type TaskBoardLabels } from "../TaskBoard/TaskBoard";
import type { TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import {
  loadWorkspace,
  saveWorkspace,
  type TaskList,
  type WorkspaceData,
} from "../../features/tasks/taskStorage";
import { removeUnreferencedTaskFiles } from "../../features/tasks/taskMediaStorage";
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
  const [taskListToRename, setTaskListToRename] = useState<string | null>(null);
  const renameTaskListSubmitRef = useRef(false);
  const renameTaskListCancelRef = useRef(false);
  const skipNextSave = useRef(false);
  const pendingWorkspaceSave = useRef<WorkspaceData | null>(null);
  const saveTimer = useRef<number | null>(null);
  const loadError = storageStatus === "load-error";

  const cleanupTimer = useRef<number | null>(null);

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

  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.getElementById("workspace-sidebar-content") : null,
  );
  const navRef = useRef<HTMLElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const {
    updateScrollbar: updateSidebarScrollbar,
    onTrackPointerDown: handleScrollbarTrackPointerDown,
    onThumbPointerDown: handleScrollbarThumbPointerDown,
    onThumbPointerMove: handleScrollbarThumbPointerMove,
    onThumbPointerUp: handleScrollbarThumbPointerUp,
    onKeyDown: handleScrollbarKeyDown,
  } = useCustomVerticalScrollbar(navRef, scrollbarTrackRef);
  const selectedTaskList =
    workspace.taskLists.find((taskList) => taskList.id === workspace.selectedTaskListId) ?? null;
  const selectedTaskListId = selectedTaskList?.id ?? null;

  useIsomorphicLayoutEffect(() => {
    if (!sidebarTarget) {
      setSidebarTarget(document.getElementById("workspace-sidebar-content"));
    }
  }, [sidebarTarget]);

  useIsomorphicLayoutEffect(() => {
    updateSidebarScrollbar();
  }, [sidebarTarget, updateSidebarScrollbar, workspace.taskLists]);

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

  const selectTaskList = (id: string) => {
    setWorkspace((current) =>
      current.selectedTaskListId === id ? current : { ...current, selectedTaskListId: id },
    );
  };

  const deleteTaskList = (id: string) => {
    setWorkspace((current) => {
      const taskLists = current.taskLists.filter((taskList) => taskList.id !== id);
      const selectedTaskListId =
        current.selectedTaskListId === id ? (taskLists[0]?.id ?? null) : current.selectedTaskListId;

      return { ...current, taskLists, selectedTaskListId };
    });
  };

  const renameTaskList = useCallback((id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setWorkspace((current) => ({
      ...current,
      taskLists: current.taskLists.map((taskList) =>
        taskList.id === id ? { ...taskList, title: nextTitle } : taskList,
      ),
    }));
    setTaskListToRename(null);
  }, []);

  const { contextMenu, onContextMenu } = useContextMenu({
    actionsLabel: labels.actionsLabel,
    editLabel: labels.editTaskList,
    label: labels.deleteTaskList,
    disabled: storageStatus !== "ready",
    onEdit: (id: string) => {
      setTaskListToRename(id);
    },
    onSelect: deleteTaskList,
  });

  const createTaskList = () => {
    if (storageStatus !== "ready") return;

    setWorkspace((current) => {
      const baseTitle = labels.newTaskList;
      const existingTitles = new Set(current.taskLists.map((taskList) => taskList.title));
      let title = baseTitle;
      let suffix = 2;
      while (existingTitles.has(title)) {
        title = `${baseTitle} ${suffix}`;
        suffix += 1;
      }
      const taskList: TaskList = { id: crypto.randomUUID(), title, tasks: [] };

      return {
        ...current,
        taskLists: [...current.taskLists, taskList],
        selectedTaskListId: taskList.id,
      };
    });
  };

  const sidebar = sidebarTarget
    ? createPortal(
        <div className={styles.sidebarContent}>
          <header className={styles.sidebarHeader}>
            <h2>{labels.sidebarTasks}</h2>
            <button
              className={styles.sidebarAction}
              type="button"
              aria-label={labels.newTaskList}
              title={labels.newTaskList}
              disabled={storageStatus !== "ready"}
              onClick={createTaskList}
            >
              <LuFilePlus aria-hidden="true" />
            </button>
          </header>
          <div className={styles.sidebarNavWrapper}>
            <nav ref={navRef} aria-label={labels.sidebarTaskLists}>
              <ul className={styles.taskListNavigation}>
                {workspace.taskLists.map((taskList) => (
                  <li key={taskList.id}>
                    {taskListToRename === taskList.id ? (
                      <input
                        className={styles.taskListInput}
                        autoFocus
                        type="text"
                        defaultValue={taskList.title}
                        maxLength={200}
                        aria-label={labels.editTaskList}
                        onBlur={(event) => {
                          if (renameTaskListCancelRef.current) {
                            renameTaskListCancelRef.current = false;
                            return;
                          }

                          if (renameTaskListSubmitRef.current) {
                            renameTaskListSubmitRef.current = false;
                          }

                          const nextTitle = event.currentTarget.value.trim();
                          if (nextTitle) renameTaskList(taskList.id, nextTitle);
                          else setTaskListToRename(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            renameTaskListSubmitRef.current = true;
                            event.currentTarget.blur();
                            return;
                          }

                          if (event.key !== "Escape") return;

                          event.preventDefault();
                          renameTaskListCancelRef.current = true;
                          setTaskListToRename(null);
                          event.currentTarget.blur();
                        }}
                      />
                    ) : (
                      <button
                        className={styles.taskListLink}
                        type="button"
                        aria-label={taskList.title}
                        title={taskList.title}
                        aria-current={
                          taskList.id === workspace.selectedTaskListId ? "page" : undefined
                        }
                        onClick={() => selectTaskList(taskList.id)}
                        onContextMenu={(event) => onContextMenu(event, taskList.id)}
                      >
                        <LuListTodo aria-hidden="true" />
                        <span>{taskList.title}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div
              className={styles.sidebarScrollbar}
              ref={scrollbarTrackRef}
              role="scrollbar"
              aria-label={labels.sidebarTaskLists}
              aria-controls="workspace-sidebar-content"
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={0}
              aria-valuenow={0}
              tabIndex={0}
              onPointerDown={handleScrollbarTrackPointerDown}
              onKeyDown={handleScrollbarKeyDown}
            >
              <div
                className={styles.sidebarScrollbarThumb}
                onPointerDown={handleScrollbarThumbPointerDown}
                onPointerMove={handleScrollbarThumbPointerMove}
                onPointerUp={handleScrollbarThumbPointerUp}
                onPointerCancel={handleScrollbarThumbPointerUp}
              />
            </div>
          </div>
        </div>,
        sidebarTarget,
      )
    : null;

  return (
    <>
      {sidebar}
      {contextMenu}
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
              onTasksChange={handleTasksChange}
              onTitleChange={handleTitleChange}
              onBannerChange={handleBannerChange}
            />
          ) : null}
        </>
      )}
    </>
  );
}
