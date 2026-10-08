import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { LuImagePlus, LuKanban, LuListTodo, LuPlus } from "react-icons/lu";
import { TASK_BACKGROUNDS, type TaskBackgroundId } from "../../../features/tasks/taskBackgrounds";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../../features/tasks/taskStorage";
import { useContextMenu } from "../../ContextMenu/useContextMenu";
import { useMarqueeSelection } from "../../../hooks/useMarqueeSelection";
import Marquee from "../../Marquee/Marquee";
import TaskCard from "./TaskCard";
import TaskDetails from "./TaskDetails";
import { useCustomScrollbar } from "../hooks/useCustomScrollbar";
import { useDragReorder } from "../hooks/useDragReorder";
import { useTaskDetailsPreference } from "../hooks/useTaskDetailsPreference";
import styles from "./TaskBoard.module.css";

export interface TaskBoardLabels {
  actionsLabel: string;
  boardView: string;
  titleLabel: string;
  addTask: string;
  taskPlaceholder: string;
  closeTaskDetails: string;
  toggleTaskDetailsWidth: string;
  resizeTaskDetails: string;
  taskScrollbar: string;
  deleteTask: string;
  editTask: string;
  addBanner: string;
  changeBanner: string;
  removeBanner: string;
  selectBanner: string;
  closeBannerPicker: string;
  backgroundLabels: Record<TaskBackgroundId, string>;
  statusLabels: Record<TaskStatus, string>;
}

interface Props {
  taskListId: string;
  title: string;
  tasks: Task[];
  bannerId: TaskBackgroundId | null;
  labels: TaskBoardLabels;
  closeTaskDetailsRequest: boolean;
  onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void;
  onTitleChange: (title: string) => void;
  onBannerChange: (bannerId: TaskBackgroundId | null) => void;
  onTaskDetailsOpenChange: (isOpen: boolean) => void;
  onTaskDetailsClosed: () => void;
}

export default memo(function TaskBoard({
  taskListId,
  title,
  tasks,
  bannerId,
  labels,
  closeTaskDetailsRequest,
  onTasksChange,
  onTitleChange,
  onBannerChange,
  onTaskDetailsOpenChange,
  onTaskDetailsClosed,
}: Props) {
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState(title);
  const [draftPosition, setDraftPosition] = useState<"start" | "end">("end");
  const [isBannerPickerOpen, setIsBannerPickerOpen] = useState(false);
  const [taskIdToRename, setTaskIdToRename] = useState<string | null>(null);
  const [taskIdToDeleteAfterClose, setTaskIdToDeleteAfterClose] = useState<string | null>(null);
  const taskDetailsCloseInProgress = useRef(
    closeTaskDetailsRequest || taskIdToDeleteAfterClose !== null,
  );
  useLayoutEffect(() => {
    taskDetailsCloseInProgress.current =
      closeTaskDetailsRequest || taskIdToDeleteAfterClose !== null;
  }, [closeTaskDetailsRequest, taskIdToDeleteAfterClose]);
  const draftCommitted = useRef(false);
  const titleEditCancelled = useRef(false);
  const taskElements = useRef(new Map<string, HTMLElement>());
  const taskToRefocus = useRef<string | null>(null);
  const {
    scrollerRef: columnsScrollerRef,
    verticalScrollerRef: columnsBodyRef,
    columnsRef,
    trackRef: scrollbarTrackRef,
    verticalTrackRef: verticalScrollbarTrackRef,
    onTrackPointerDown: handleScrollbarTrackPointerDown,
    onThumbPointerDown: handleScrollbarThumbPointerDown,
    onThumbPointerMove: handleScrollbarThumbPointerMove,
    onThumbPointerUp: stopThumbDragging,
    onVerticalTrackPointerDown: handleVerticalScrollbarTrackPointerDown,
    onVerticalThumbPointerDown: handleVerticalScrollbarThumbPointerDown,
    onVerticalThumbPointerMove: handleVerticalScrollbarThumbPointerMove,
    onVerticalThumbPointerUp: stopVerticalScrollbarThumbDragging,
    onVerticalKeyDown: handleVerticalScrollbarKeyDown,
  } = useCustomScrollbar();
  const getSelectableElements = useCallback(() => taskElements.current, []);
  const { selectedIds, selectedCount, isSelected, clearSelection, startSelection, marqueeStyle } =
    useMarqueeSelection<string>(columnsBodyRef, getSelectableElements);
  const {
    selectedTaskId,
    setSelectedTaskId,
    panelWidth: taskDetailsWidth,
    setPanelWidth: setTaskDetailsWidth,
  } = useTaskDetailsPreference(taskListId, tasks);
  const [taskDetailsTarget] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.getElementById("workspace-task-details") : null,
  );
  const [taskDetailsSeparator] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined"
      ? document.getElementById("workspace-task-details-separator")
      : null,
  );
  const {
    dragOverTaskId,
    dropPosition,
    clearDragOverTaskId,
    handleCardDragStart,
    handleCardDragOver,
    handleBoardDragOverCapture,
    handleBoardDragLeaveCapture,
    stopAutoScroll,
    handleCardDragLeave,
    handleCardDrop,
  } = useDragReorder(onTasksChange, columnsBodyRef, selectedCount, selectedIds, clearSelection);
  const selectedBackground = TASK_BACKGROUNDS.find((background) => background.id === bannerId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const closeTaskDetails = useCallback(() => {
    if (taskIdToDeleteAfterClose !== null) {
      onTasksChange((currentTasks) =>
        currentTasks.filter((task) => task.id !== taskIdToDeleteAfterClose),
      );
      setTaskIdToDeleteAfterClose(null);
    }
    setSelectedTaskId(null);
    onTaskDetailsClosed();
  }, [onTaskDetailsClosed, onTasksChange, setSelectedTaskId, taskIdToDeleteAfterClose]);
  const updateTaskDetails = useCallback(
    (taskId: string, changes: Partial<Pick<Task, "title" | "content">>) => {
      onTasksChange((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
      );
    },
    [onTasksChange],
  );
  const { contextMenu, onContextMenu } = useContextMenu({
    actionsLabel: labels.actionsLabel,
    editLabel: labels.editTask,
    label: labels.deleteTask,
    selectedCount,
    onEdit: (taskId: string) => {
      setTaskIdToRename(taskId);
    },
    onSelect: (taskId: string) => {
      if (selectedCount > 0) {
        const idsToDelete = Array.from(selectedIds);
        const selectedTaskIsBeingDeleted =
          selectedTaskId !== null && idsToDelete.includes(selectedTaskId);
        if (selectedTaskIsBeingDeleted) {
          setTaskIdToDeleteAfterClose(selectedTaskId);
        }
        onTasksChange((currentTasks) =>
          currentTasks.filter(
            (task) =>
              !idsToDelete.includes(task.id) ||
              (selectedTaskIsBeingDeleted && task.id === selectedTaskId),
          ),
        );
        clearSelection();
      } else {
        if (selectedTaskId === taskId) {
          setTaskIdToDeleteAfterClose(taskId);
        } else {
          onTasksChange((currentTasks) =>
            currentTasks.filter((currentTask) => currentTask.id !== taskId),
          );
        }
      }
    },
  });
  const registerTaskElement = useCallback((taskId: string, element: HTMLElement | null) => {
    if (element) {
      taskElements.current.set(taskId, element);
    } else {
      taskElements.current.delete(taskId);
    }
  }, []);
  const selectTask = useCallback(
    (taskId: string) => {
      if (taskDetailsCloseInProgress.current) return;
      setSelectedTaskId(taskId);
    },
    [setSelectedTaskId],
  );
  const cancelTaskRename = useCallback(() => setTaskIdToRename(null), []);
  const renameTask = useCallback(
    (taskId: string, nextTitle: string) => {
      const title = nextTitle.trim();
      if (!title) return;

      onTasksChange((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
      );
      setTaskIdToRename(null);
    },
    [onTasksChange],
  );
  const prepareTaskRefocus = useCallback((taskId: string) => {
    taskToRefocus.current = taskId;
  }, []);
  const moveTask = useCallback(
    (taskId: string, status: TaskStatus) => {
      onTasksChange((currentTasks) => {
        const currentTask = currentTasks.find((item) => item.id === taskId);
        if (!currentTask || currentTask.status === status) return currentTasks;

        return currentTasks.map((item) => (item.id === taskId ? { ...item, status } : item));
      });
    },
    [onTasksChange],
  );
  const moveTaskToEnd = useCallback(
    (taskId: string, status: TaskStatus) => {
      onTasksChange((currentTasks) => {
        const currentTask = currentTasks.find((item) => item.id === taskId);
        if (!currentTask) return currentTasks;

        const lastTaskInStatus = currentTasks.reduce<Task | null>(
          (lastTask, task) => (task.status === status ? task : lastTask),
          null,
        );
        if (currentTask.status === status && lastTaskInStatus?.id === taskId) {
          return currentTasks;
        }

        const movedTask = currentTask.status === status ? currentTask : { ...currentTask, status };
        return [...currentTasks.filter((task) => task.id !== taskId), movedTask];
      });
    },
    [onTasksChange],
  );
  const handleColumnDrop = useCallback(
    (event: DragEvent<HTMLElement>, status: TaskStatus) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("text/plain");

      if (!data || dragOverTaskId !== null) return;

      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          onTasksChange((currentTasks) => {
            return currentTasks.map((task) =>
              parsed.includes(task.id) ? { ...task, status } : task,
            );
          });
          clearSelection();
          clearDragOverTaskId();
          return;
        }
      } catch {
        const taskId = data;
        moveTaskToEnd(taskId, status);
      }

      clearDragOverTaskId();
    },
    [clearDragOverTaskId, clearSelection, dragOverTaskId, moveTaskToEnd, onTasksChange],
  );
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    notStarted: [],
    inProgress: [],
    completed: [],
  };

  useEffect(() => setTitleDraft(title), [title]);
  useLayoutEffect(() => {
    onTaskDetailsOpenChange(selectedTaskId !== null);
  }, [onTaskDetailsOpenChange, selectedTaskId]);
  for (const task of tasks) {
    tasksByStatus[task.status].push(task);
  }

  useEffect(() => {
    if (taskToRefocus.current === null) return;

    taskElements.current.get(taskToRefocus.current)?.focus();
    taskToRefocus.current = null;
  }, [tasks]);

  const commitDraft = (title: string, status: TaskStatus) => {
    const taskTitle = title.trim();
    if (!taskTitle || draftCommitted.current) return;

    draftCommitted.current = true;
    const newTask = { id: crypto.randomUUID(), title: taskTitle, status };
    onTasksChange((currentTasks) => {
      if (draftPosition === "end") return [...currentTasks, newTask];

      const firstTaskIndex = currentTasks.findIndex((task) => task.status === status);
      if (firstTaskIndex === -1) return [...currentTasks, newTask];

      const updatedTasks = [...currentTasks];
      updatedTasks.splice(firstTaskIndex, 0, newTask);
      return updatedTasks;
    });
    setActiveColumn(null);
  };

  const handleCreateTask = (event: SyntheticEvent<HTMLFormElement>, status: TaskStatus) => {
    event.preventDefault();
    commitDraft(draftTitle, status);
  };

  const openTaskForm = (status: TaskStatus, position: "start" | "end") => {
    setDraftTitle("");
    draftCommitted.current = false;
    setDraftPosition(position);
    setActiveColumn(status);
  };

  const taskCreationForm =
    activeColumn === null ? null : (
      <form
        className={styles.createForm}
        onSubmit={(event) => handleCreateTask(event, activeColumn)}
      >
        <textarea
          className={styles.taskInput}
          autoFocus
          rows={1}
          value={draftTitle}
          maxLength={200}
          placeholder={labels.taskPlaceholder}
          aria-label={labels.taskPlaceholder}
          data-no-marquee
          onChange={(event) => {
            const input = event.currentTarget;
            setDraftTitle(input.value);
            input.style.height = "auto";
            input.style.height = `${input.scrollHeight}px`;
          }}
          onBlur={(event) => {
            const title = event.currentTarget.value;
            if (title.trim()) {
              commitDraft(title, activeColumn);
            } else {
              setActiveColumn(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
              return;
            }

            if (event.key !== "Escape") return;

            event.preventDefault();
            draftCommitted.current = true;
            setActiveColumn(null);
          }}
        />
      </form>
    );

  return (
    <div className={styles.workspace}>
      <section
        className={styles.board}
        aria-labelledby="task-board-title"
        onWheel={(event) => {
          const columnsBody = columnsBodyRef.current;
          if (columnsBody && event.target instanceof Node && !columnsBody.contains(event.target)) {
            columnsBody.scrollTop += event.deltaY;
          }
        }}
      >
        <header className={styles.header}>
          {selectedBackground && (
            <div
              className={styles.banner}
              style={{ backgroundImage: `url("${selectedBackground.src}")` }}
            >
              <div className={styles.bannerActions}>
                <button
                  className={styles.bannerAction}
                  type="button"
                  aria-expanded={isBannerPickerOpen}
                  aria-controls={isBannerPickerOpen ? "task-banner-picker" : undefined}
                  onClick={() => setIsBannerPickerOpen((open) => !open)}
                >
                  {labels.changeBanner}
                </button>
                <button
                  className={styles.bannerAction}
                  type="button"
                  onClick={() => {
                    onBannerChange(null);
                    setIsBannerPickerOpen(false);
                  }}
                >
                  {labels.removeBanner}
                </button>
              </div>
            </div>
          )}
          {!selectedBackground && (
            <div className={styles.bannerActions}>
              <button
                className={styles.bannerAction}
                type="button"
                aria-expanded={isBannerPickerOpen}
                aria-controls={isBannerPickerOpen ? "task-banner-picker" : undefined}
                onClick={() => setIsBannerPickerOpen((open) => !open)}
              >
                <LuImagePlus aria-hidden="true" />
                {labels.addBanner}
              </button>
            </div>
          )}
          {isBannerPickerOpen && (
            <div
              className={styles.bannerPicker}
              id="task-banner-picker"
              role="group"
              aria-label={labels.selectBanner}
            >
              {TASK_BACKGROUNDS.map((background) => (
                <button
                  className={styles.bannerOption}
                  key={background.id}
                  type="button"
                  aria-pressed={background.id === bannerId}
                  onClick={() => {
                    onBannerChange(background.id);
                    setIsBannerPickerOpen(false);
                  }}
                >
                  <img src={background.src} alt="" />
                  <span>{labels.backgroundLabels[background.id]}</span>
                </button>
              ))}
              <button
                className={styles.bannerAction}
                type="button"
                onClick={() => setIsBannerPickerOpen(false)}
              >
                {labels.closeBannerPicker}
              </button>
            </div>
          )}
          <div className={styles.titleLine}>
            <LuListTodo aria-hidden="true" />
            <div className={styles.titleInputWrapper}>
              <input
                id="task-board-title"
                className={styles.titleInput}
                type="text"
                value={titleDraft}
                maxLength={200}
                aria-label={labels.titleLabel}
                onChange={(event) => setTitleDraft(event.currentTarget.value)}
                onBlur={(event) => {
                  const nextTitle = event.currentTarget.value.trim();
                  if (titleEditCancelled.current) {
                    titleEditCancelled.current = false;
                    setTitleDraft(title);
                  } else if (nextTitle) {
                    setTitleDraft(nextTitle);
                    if (nextTitle !== title) onTitleChange(nextTitle);
                  } else {
                    setTitleDraft(title);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    if (event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    titleEditCancelled.current = true;
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          </div>
        </header>

        <div className={styles.viewToolbar}>
          <div className={styles.viewTabs}>
            <span className={styles.activeView} aria-current="page">
              <LuKanban aria-hidden="true" />
              {labels.boardView}
            </span>
          </div>
        </div>

        <div className={styles.columnsViewport}>
          <div
            className={styles.columnsScroller}
            ref={columnsScrollerRef}
            onDragOverCapture={handleBoardDragOverCapture}
            onDragLeaveCapture={handleBoardDragLeaveCapture}
            onDropCapture={stopAutoScroll}
          >
            <div className={styles.columns}>
              {TASK_STATUSES.map((status) => {
                const columnTasks = tasksByStatus[status];

                return (
                  <div
                    className={styles.columnHeader}
                    key={`header-${status}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleColumnDrop(event, status)}
                  >
                    <h2 className={styles.statusBadge}>
                      <span className={styles.statusDot} aria-hidden="true" />
                      {labels.statusLabels[status]}
                    </h2>
                    <div className={styles.columnActions}>
                      <span>{columnTasks.length}</span>
                      <button
                        className={styles.iconButton}
                        type="button"
                        aria-label={`${labels.addTask}: ${labels.statusLabels[status]}`}
                        title={`${labels.addTask}: ${labels.statusLabels[status]}`}
                        onClick={() => openTaskForm(status, "start")}
                      >
                        <LuPlus aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className={styles.columnsBody} ref={columnsBodyRef} onMouseDown={startSelection}>
                <div className={styles.columnsBodyContent} ref={columnsRef}>
                  {TASK_STATUSES.map((status) => {
                    const columnTasks = tasksByStatus[status];

                    return (
                      <section
                        className={styles.column}
                        key={`column-${status}`}
                        aria-label={labels.statusLabels[status]}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleColumnDrop(event, status)}
                      >
                        <div className={styles.columnContent}>
                          {activeColumn === status && draftPosition === "start" && taskCreationForm}

                          {columnTasks.length > 0 && (
                            <div className={styles.taskList}>
                              {columnTasks.map((task) => (
                                <TaskCard
                                  key={task.id}
                                  id={task.id}
                                  title={task.title}
                                  status={status}
                                  statusLabel={labels.statusLabels[status]}
                                  isSelected={selectedTaskId === task.id}
                                  isEditing={taskIdToRename === task.id}
                                  isMultiSelected={isSelected(task.id)}
                                  dropIndicator={dragOverTaskId === task.id ? dropPosition : null}
                                  disableMarquee={true}
                                  registerTaskElement={registerTaskElement}
                                  onContextMenu={onContextMenu}
                                  onSelect={selectTask}
                                  onRename={renameTask}
                                  onCancel={cancelTaskRename}
                                  onMove={moveTask}
                                  onPrepareRefocus={prepareTaskRefocus}
                                  onDragStart={handleCardDragStart}
                                  onDragOver={handleCardDragOver}
                                  onDragLeave={handleCardDragLeave}
                                  onDrop={handleCardDrop}
                                />
                              ))}
                            </div>
                          )}

                          {activeColumn === status && draftPosition === "end" && taskCreationForm}
                          {activeColumn !== status && (
                            <button
                              className={styles.addButton}
                              type="button"
                              onClick={() => openTaskForm(status, "end")}
                            >
                              <LuPlus aria-hidden="true" />
                              {labels.addTask}
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
                {marqueeStyle && (
                  <Marquee
                    left={marqueeStyle.left}
                    top={marqueeStyle.top}
                    width={marqueeStyle.width}
                    height={marqueeStyle.height}
                  />
                )}
              </div>
            </div>
          </div>
          <div
            className={styles.verticalScrollbar}
            ref={verticalScrollbarTrackRef}
            role="scrollbar"
            aria-label={labels.taskScrollbar}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={0}
            aria-valuenow={0}
            tabIndex={0}
            onPointerDown={handleVerticalScrollbarTrackPointerDown}
            onKeyDown={handleVerticalScrollbarKeyDown}
          >
            <div
              className={styles.verticalScrollbarThumb}
              onPointerDown={handleVerticalScrollbarThumbPointerDown}
              onPointerMove={handleVerticalScrollbarThumbPointerMove}
              onPointerUp={stopVerticalScrollbarThumbDragging}
              onPointerCancel={stopVerticalScrollbarThumbDragging}
            />
          </div>
        </div>
        <div
          className={styles.customScrollbar}
          ref={scrollbarTrackRef}
          onPointerDown={handleScrollbarTrackPointerDown}
        >
          <div
            className={styles.customScrollbarThumb}
            onPointerDown={handleScrollbarThumbPointerDown}
            onPointerMove={handleScrollbarThumbPointerMove}
            onPointerUp={stopThumbDragging}
            onPointerCancel={stopThumbDragging}
          />
        </div>
      </section>
      {selectedTask && taskDetailsTarget && taskDetailsSeparator
        ? createPortal(
            <TaskDetails
              key={selectedTask.id}
              task={selectedTask}
              titleLabel={labels.taskPlaceholder}
              closeLabel={labels.closeTaskDetails}
              toggleWidthLabel={labels.toggleTaskDetailsWidth}
              resizeLabel={labels.resizeTaskDetails}
              width={taskDetailsWidth}
              resizeTarget={taskDetailsSeparator}
              closeRequested={
                closeTaskDetailsRequest || taskIdToDeleteAfterClose === selectedTask.id
              }
              onClose={closeTaskDetails}
              onResize={setTaskDetailsWidth}
              onTaskChange={updateTaskDetails}
            />,
            taskDetailsTarget,
          )
        : null}
      {contextMenu}
    </div>
  );
});
