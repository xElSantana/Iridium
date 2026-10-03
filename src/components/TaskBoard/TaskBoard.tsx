import { memo, useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { LuImagePlus, LuKanban, LuListTodo, LuPlus } from "react-icons/lu";
import { TASK_BACKGROUNDS, type TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../features/tasks/taskStorage";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import TaskCard from "./TaskCard";
import TaskDetails from "./TaskDetails";
import { useCustomScrollbar } from "./useCustomScrollbar";
import { useDragReorder } from "./useDragReorder";
import { useTaskDetailsPreference } from "./useTaskDetailsPreference";
import styles from "./TaskBoard.module.css";

export interface TaskBoardLabels {
  boardView: string;
  addTask: string;
  taskPlaceholder: string;
  closeTaskDetails: string;
  resizeTaskDetails: string;
  deleteTask: string;
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
  onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void;
  onBannerChange: (bannerId: TaskBackgroundId | null) => void;
}

export default memo(function TaskBoard({
  taskListId,
  title,
  tasks,
  bannerId,
  labels,
  onTasksChange,
  onBannerChange,
}: Props) {
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [isBannerPickerOpen, setIsBannerPickerOpen] = useState(false);
  const {
    dragOverTaskId,
    dropPosition,
    clearDragOverTaskId,
    handleCardDragStart,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
  } = useDragReorder(onTasksChange);
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
  const draftCommitted = useRef(false);
  const taskElements = useRef(new Map<string, HTMLElement>());
  const taskToRefocus = useRef<string | null>(null);
  const {
    scrollerRef: columnsScrollerRef,
    columnsRef,
    trackRef: scrollbarTrackRef,
    onTrackPointerDown: handleScrollbarTrackPointerDown,
    onThumbPointerDown: handleScrollbarThumbPointerDown,
    onThumbPointerMove: handleScrollbarThumbPointerMove,
    onThumbPointerUp: stopThumbDragging,
  } = useCustomScrollbar();
  const selectedBackground = TASK_BACKGROUNDS.find((background) => background.id === bannerId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const closeTaskDetails = useCallback(() => {
    setSelectedTaskId(null);
  }, []);
  const updateTaskDetails = useCallback(
    (taskId: string, changes: Partial<Pick<Task, "title" | "content">>) => {
      onTasksChange((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
      );
    },
    [onTasksChange],
  );
  const { contextMenu, onContextMenu } = useContextMenu({
    label: labels.deleteTask,
    onSelect: (taskId: string) => {
      onTasksChange((currentTasks) =>
        currentTasks.filter((currentTask) => currentTask.id !== taskId),
      );
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
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
  const selectTask = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
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
    onTasksChange((currentTasks) => [...currentTasks, newTask]);
    setActiveColumn(null);
  };

  const handleCreateTask = (event: SyntheticEvent<HTMLFormElement>, status: TaskStatus) => {
    event.preventDefault();
    commitDraft(draftTitle, status);
  };

  const openTaskForm = (status: TaskStatus) => {
    setDraftTitle("");
    draftCommitted.current = false;
    setActiveColumn(status);
  };

  return (
    <div className={styles.workspace}>
      <section className={styles.board} aria-labelledby="task-board-title">
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
            <h1 id="task-board-title">{title}</h1>
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

        <div className={styles.columnsScroller} ref={columnsScrollerRef}>
          <div className={styles.columns} ref={columnsRef}>
            {TASK_STATUSES.map((status) => {
              const columnTasks = tasks.filter((task) => task.status === status);

              return (
                <section
                  className={styles.column}
                  key={status}
                  aria-label={labels.statusLabels[status]}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain");

                    if (taskId && dragOverTaskId === null) moveTask(taskId, status);
                    clearDragOverTaskId();
                  }}
                >
                  <div className={styles.columnHeader}>
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
                        onClick={() => openTaskForm(status)}
                      >
                        <LuPlus aria-hidden="true" />
                      </button>
                    </div>
                  </div>

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
                          dropIndicator={dragOverTaskId === task.id ? dropPosition : null}
                          registerTaskElement={registerTaskElement}
                          onContextMenu={onContextMenu}
                          onSelect={selectTask}
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

                  {activeColumn === status ? (
                    <form
                      className={styles.createForm}
                      onSubmit={(event) => handleCreateTask(event, status)}
                    >
                      <textarea
                        className={styles.taskInput}
                        autoFocus
                        rows={1}
                        value={draftTitle}
                        maxLength={200}
                        placeholder={labels.taskPlaceholder}
                        aria-label={labels.taskPlaceholder}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          setDraftTitle(input.value);
                          input.style.height = "auto";
                          input.style.height = `${input.scrollHeight}px`;
                        }}
                        onBlur={(event) => {
                          const title = event.currentTarget.value;
                          if (title.trim()) {
                            commitDraft(title, status);
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
                  ) : (
                    <button
                      className={styles.addButton}
                      type="button"
                      onClick={() => openTaskForm(status)}
                    >
                      <LuPlus aria-hidden="true" />
                      {labels.addTask}
                    </button>
                  )}
                </section>
              );
            })}
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
              resizeLabel={labels.resizeTaskDetails}
              width={taskDetailsWidth}
              resizeTarget={taskDetailsSeparator}
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
