import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { useCustomVerticalScrollbar } from "../../hooks/useCustomVerticalScrollbar";
import { createPortal } from "react-dom";
import { LuFilePlus, LuListTodo } from "react-icons/lu";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import { useMarqueeSelection } from "../../hooks/useMarqueeSelection";
import Marquee from "../Marquee/Marquee";
import TaskBoard, { type TaskBoardLabels } from "../TaskBoard/components/TaskBoard";
import type { TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import {
  loadWorkspace,
  saveWorkspace,
  type TaskList,
  type WorkspaceData,
} from "../../features/tasks/taskStorage";
import { removeUnreferencedTaskFiles } from "../../features/tasks/taskMediaStorage";
import { useDragAutoScroll } from "../../hooks/useDragAutoScroll";
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

const TASK_LIST_DRAG_TYPE = "application/x-iridium-task-list";

export default function WorkspaceContent({ labels }: Props) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [storageStatus, setStorageStatus] = useState<"loading" | "ready" | "load-error">("loading");
  const [saveError, setSaveError] = useState(false);
  const [taskListToRename, setTaskListToRename] = useState<string | null>(null);
  const [dragOverTaskList, setDragOverTaskList] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
  const [pendingTaskListId, setPendingTaskListId] = useState<string | null>(null);
  const [pendingTaskListToDelete, setPendingTaskListToDelete] = useState<string | null>(null);
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

  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const taskListElements = useRef(new Map<string, HTMLElement>());
  const taskListSelectionAnchor = useRef<string | null>(null);
  const { updateAutoScroll, stopAutoScroll: stopSidebarAutoScroll } = useDragAutoScroll(navRef);
  const getSelectableTaskLists = useCallback(() => taskListElements.current, []);
  const {
    selectedIds: selectedTaskListIds,
    selectedCount: selectedTaskListCount,
    isSelected: isTaskListSelected,
    clearSelection: clearTaskListSelection,
    selectItems: selectTaskLists,
    startSelection: startTaskListSelection,
    marqueeStyle: taskListMarqueeStyle,
  } = useMarqueeSelection<string>(navRef, getSelectableTaskLists, {
    allowShiftDragOnSelectableElements: true,
  });
  const {
    updateScrollbar: updateSidebarScrollbar,
    onTrackPointerDown: handleScrollbarTrackPointerDown,
    onThumbPointerDown: handleScrollbarThumbPointerDown,
    onThumbPointerMove: handleScrollbarThumbPointerMove,
    onThumbPointerUp: handleScrollbarThumbPointerUp,
    onKeyDown: handleScrollbarKeyDown,
  } = useCustomVerticalScrollbar(navRef, scrollbarTrackRef);
  const clearTaskListDrag = useCallback(() => {
    stopSidebarAutoScroll();
    setDragOverTaskList(null);
  }, [stopSidebarAutoScroll]);

  useEffect(() => {
    document.addEventListener("dragend", clearTaskListDrag);
    return () => document.removeEventListener("dragend", clearTaskListDrag);
  }, [clearTaskListDrag]);

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
    if (pendingTaskListId === null && pendingTaskListToDelete === null) return;

    setWorkspace((current) => {
      const taskLists =
        pendingTaskListToDelete === null
          ? current.taskLists
          : current.taskLists.filter((taskList) => taskList.id !== pendingTaskListToDelete);
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
    setPendingTaskListToDelete(null);
  }, [pendingTaskListId, pendingTaskListToDelete]);

  const deleteTaskList = (id: string) => {
    if (id === workspace.selectedTaskListId && taskDetailsOpen) {
      const replacementTaskListId =
        workspace.taskLists.find((taskList) => taskList.id !== id)?.id ?? null;
      setPendingTaskListId(replacementTaskListId);
      setPendingTaskListToDelete(id);
      return;
    }

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

  const handleTaskListDragStart = (event: DragEvent<HTMLButtonElement>, id: string) => {
    event.dataTransfer.setData(TASK_LIST_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleTaskListDragOver = (event: DragEvent<HTMLButtonElement>, id: string) => {
    if (!event.dataTransfer.types.includes(TASK_LIST_DRAG_TYPE)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const { top, height } = event.currentTarget.getBoundingClientRect();
    const nextDragOverTaskList = {
      id,
      position: event.clientY < top + height / 2 ? "before" : "after",
    } as const;
    setDragOverTaskList((current) =>
      current?.id === nextDragOverTaskList.id && current.position === nextDragOverTaskList.position
        ? current
        : nextDragOverTaskList,
    );
  };

  const handleTaskListDrop = (event: DragEvent<HTMLButtonElement>, targetId: string) => {
    if (!event.dataTransfer.types.includes(TASK_LIST_DRAG_TYPE)) return;

    event.preventDefault();
    const draggedId = event.dataTransfer.getData(TASK_LIST_DRAG_TYPE);
    const { top, height } = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < top + height / 2 ? "before" : "after";
    clearTaskListDrag();
    if (!draggedId || draggedId === targetId) return;

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
  };

  const { contextMenu, onContextMenu } = useContextMenu({
    actionsLabel: labels.actionsLabel,
    editLabel: labels.editTaskList,
    label: labels.deleteTaskList,
    disabled: storageStatus !== "ready",
    selectedCount: selectedTaskListCount,
    onEdit: (id: string) => {
      setTaskListToRename(id);
    },
    onSelect: (id: string) => {
      if (selectedTaskListCount > 0) {
        const idsToDelete = Array.from(selectedTaskListIds);
        setWorkspace((current) => ({
          ...current,
          taskLists: current.taskLists.filter((taskList) => !idsToDelete.includes(taskList.id)),
          selectedTaskListId: idsToDelete.includes(current.selectedTaskListId ?? "")
            ? (current.taskLists.find((tl) => !idsToDelete.includes(tl.id))?.id ?? null)
            : current.selectedTaskListId,
        }));
        clearTaskListSelection();
      } else {
        deleteTaskList(id);
      }
    },
  });

  const createTaskList = () => {
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
            <nav
              ref={navRef}
              aria-label={labels.sidebarTaskLists}
              onMouseDown={startTaskListSelection}
              onDragOverCapture={(event) => {
                if (event.dataTransfer.types.includes(TASK_LIST_DRAG_TYPE)) {
                  updateAutoScroll(event.clientY);
                }
              }}
              onDragLeaveCapture={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                clearTaskListDrag();
              }}
            >
              <ul className={styles.taskListNavigation}>
                {workspace.taskLists.map((taskList) => (
                  <li
                    key={taskList.id}
                    className={`${
                      dragOverTaskList?.id === taskList.id
                        ? dragOverTaskList.position === "before"
                          ? styles.dropBefore
                          : styles.dropAfter
                        : ""
                    }${isTaskListSelected(taskList.id) ? ` ${styles.selected}` : ""}`}
                  >
                    {taskListToRename === taskList.id ? (
                      <input
                        className={styles.taskListInput}
                        autoFocus
                        type="text"
                        defaultValue={taskList.title}
                        maxLength={200}
                        aria-label={labels.editTaskList}
                        data-no-marquee
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
                        draggable={storageStatus === "ready"}
                        aria-label={taskList.title}
                        title={taskList.title}
                        data-no-marquee
                        aria-current={
                          taskList.id === workspace.selectedTaskListId ? "page" : undefined
                        }
                        ref={(el) => {
                          if (el) {
                            taskListElements.current.set(taskList.id, el);
                          } else {
                            taskListElements.current.delete(taskList.id);
                          }
                        }}
                        onClick={(event) => {
                          if (event.shiftKey) {
                            const anchorIndex = workspace.taskLists.findIndex(
                              (item) => item.id === taskListSelectionAnchor.current,
                            );
                            const clickedIndex = workspace.taskLists.findIndex(
                              (item) => item.id === taskList.id,
                            );
                            if (anchorIndex === -1) {
                              taskListSelectionAnchor.current = taskList.id;
                            }
                            const startIndex =
                              anchorIndex === -1
                                ? clickedIndex
                                : Math.min(anchorIndex, clickedIndex);
                            const endIndex =
                              anchorIndex === -1
                                ? clickedIndex
                                : Math.max(anchorIndex, clickedIndex);

                            selectTaskLists(
                              workspace.taskLists
                                .slice(startIndex, endIndex + 1)
                                .map((item) => item.id),
                            );
                            event.preventDefault();
                            return;
                          }

                          taskListSelectionAnchor.current = taskList.id;
                          selectTaskList(taskList.id);
                        }}
                        onContextMenu={(event) => onContextMenu(event, taskList.id)}
                        onDragStart={(event) => {
                          if (event.shiftKey) {
                            event.preventDefault();
                            return;
                          }
                          handleTaskListDragStart(event, taskList.id);
                        }}
                        onDragOver={(event) => handleTaskListDragOver(event, taskList.id)}
                        onDrop={(event) => handleTaskListDrop(event, taskList.id)}
                      >
                        <LuListTodo aria-hidden="true" />
                        <span>{taskList.title}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {taskListMarqueeStyle && (
                <Marquee
                  left={taskListMarqueeStyle.left}
                  top={taskListMarqueeStyle.top}
                  width={taskListMarqueeStyle.width}
                  height={taskListMarqueeStyle.height}
                />
              )}
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
              closeTaskDetailsRequest={
                pendingTaskListId !== null || pendingTaskListToDelete !== null
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
