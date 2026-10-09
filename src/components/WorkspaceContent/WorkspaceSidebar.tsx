import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import { LuFilePlus, LuListTodo } from "react-icons/lu";
import { useCustomVerticalScrollbar } from "../../hooks/useCustomVerticalScrollbar";
import { useDragAutoScroll } from "../../hooks/useDragAutoScroll";
import { useMarqueeSelection } from "../../hooks/useMarqueeSelection";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import Marquee from "../Marquee/Marquee";
import type { TaskList } from "../../features/tasks/taskStorage";
import styles from "./WorkspaceSidebar.module.css";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const TASK_LIST_DRAG_TYPE = "application/x-iridium-task-list";

interface SidebarLabels {
  actionsLabel: string;
  newTaskList: string;
  deleteTaskList: string;
  editTaskList: string;
  sidebarTasks: string;
  sidebarTaskLists: string;
}

interface Props {
  labels: SidebarLabels;
  taskLists: TaskList[];
  selectedTaskListId: string | null;
  disabled: boolean;
  onCreateTaskList: () => void;
  onSelectTaskList: (id: string) => void;
  onDeleteTaskList: (id: string) => void;
  onDeleteTaskLists: (ids: string[]) => void;
  onRenameTaskList: (id: string, title: string) => void;
  onReorderTaskLists: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

function WorkspaceSidebar({
  labels,
  taskLists,
  selectedTaskListId,
  disabled,
  onCreateTaskList,
  onSelectTaskList,
  onDeleteTaskList,
  onDeleteTaskLists,
  onRenameTaskList,
  onReorderTaskLists,
}: Props) {
  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);
  const [taskListToRename, setTaskListToRename] = useState<string | null>(null);
  const [dragOverTaskList, setDragOverTaskList] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const renameTaskListSubmitRef = useRef(false);
  const renameTaskListCancelRef = useRef(false);
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

  useIsomorphicLayoutEffect(() => {
    if (!sidebarTarget) {
      setSidebarTarget(document.getElementById("workspace-sidebar-content"));
    }
  }, [sidebarTarget]);

  useIsomorphicLayoutEffect(() => {
    updateSidebarScrollbar();
  }, [sidebarTarget, taskLists, updateSidebarScrollbar]);

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

    onReorderTaskLists(draggedId, targetId, position);
  };

  const { contextMenu, onContextMenu } = useContextMenu({
    actionsLabel: labels.actionsLabel,
    editLabel: labels.editTaskList,
    label: labels.deleteTaskList,
    disabled,
    selectedCount: selectedTaskListCount,
    onEdit: (id: string) => {
      setTaskListToRename(id);
    },
    onSelect: (id: string) => {
      if (selectedTaskListCount > 0) {
        onDeleteTaskLists(Array.from(selectedTaskListIds));
        clearTaskListSelection();
      } else {
        onDeleteTaskList(id);
      }
    },
  });

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
              disabled={disabled}
              onClick={onCreateTaskList}
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
                {taskLists.map((taskList) => (
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
                          if (nextTitle) onRenameTaskList(taskList.id, nextTitle);
                          setTaskListToRename(null);
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
                        draggable={!disabled}
                        aria-label={taskList.title}
                        title={taskList.title}
                        data-no-marquee
                        aria-current={taskList.id === selectedTaskListId ? "page" : undefined}
                        ref={(el) => {
                          if (el) {
                            taskListElements.current.set(taskList.id, el);
                          } else {
                            taskListElements.current.delete(taskList.id);
                          }
                        }}
                        onClick={(event) => {
                          if (event.shiftKey) {
                            const anchorIndex = taskLists.findIndex(
                              (item) => item.id === taskListSelectionAnchor.current,
                            );
                            const clickedIndex = taskLists.findIndex(
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
                              taskLists.slice(startIndex, endIndex + 1).map((item) => item.id),
                            );
                            event.preventDefault();
                            return;
                          }

                          taskListSelectionAnchor.current = taskList.id;
                          onSelectTaskList(taskList.id);
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
    </>
  );
}

const SIDEBAR_LABEL_KEYS = [
  "actionsLabel",
  "newTaskList",
  "deleteTaskList",
  "editTaskList",
  "sidebarTasks",
  "sidebarTaskLists",
] as const;

export default memo(WorkspaceSidebar, (previous, next) => {
  return (
    SIDEBAR_LABEL_KEYS.every((key) => previous.labels[key] === next.labels[key]) &&
    previous.selectedTaskListId === next.selectedTaskListId &&
    previous.disabled === next.disabled &&
    previous.onCreateTaskList === next.onCreateTaskList &&
    previous.onSelectTaskList === next.onSelectTaskList &&
    previous.onDeleteTaskList === next.onDeleteTaskList &&
    previous.onDeleteTaskLists === next.onDeleteTaskLists &&
    previous.onRenameTaskList === next.onRenameTaskList &&
    previous.onReorderTaskLists === next.onReorderTaskLists &&
    previous.taskLists.length === next.taskLists.length &&
    previous.taskLists.every(
      (taskList, index) =>
        taskList.id === next.taskLists[index]?.id &&
        taskList.title === next.taskLists[index]?.title,
    )
  );
});
