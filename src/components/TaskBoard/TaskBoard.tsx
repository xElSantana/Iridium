import { memo, useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { LuImagePlus, LuKanban, LuListTodo, LuPlus } from "react-icons/lu";
import { TASK_BACKGROUNDS, type TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../features/tasks/taskStorage";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import TaskDetails from "./TaskDetails";
import { useCustomScrollbar } from "./useCustomScrollbar";
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
  title: string;
  tasks: Task[];
  bannerId: TaskBackgroundId | null;
  labels: TaskBoardLabels;
  onTasksChange: (tasks: Task[]) => void;
  onBannerChange: (bannerId: TaskBackgroundId | null) => void;
}

export default memo(function TaskBoard({
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailsWidth, setTaskDetailsWidth] = useState<number | null>(null);
  const [taskDetailsTarget, setTaskDetailsTarget] = useState<HTMLElement | null>(null);
  const [taskDetailsSeparator, setTaskDetailsSeparator] = useState<HTMLElement | null>(null);
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
    onThumbPointerCancel: stopThumbDraggingCancel,
  } = useCustomScrollbar();
  const selectedBackground = TASK_BACKGROUNDS.find((background) => background.id === bannerId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const closeTaskDetails = useCallback(() => {
    setSelectedTaskId(null);
    setTaskDetailsWidth(null);
  }, []);
  const { contextMenu, onContextMenu } = useContextMenu({
    label: labels.deleteTask,
    onSelect: (taskId: string) => {
      onTasksChange(tasks.filter((currentTask) => currentTask.id !== taskId));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
        setTaskDetailsWidth(null);
      }
    },
  });

  useEffect(() => {
    setTaskDetailsTarget(document.getElementById("workspace-task-details"));
    setTaskDetailsSeparator(document.getElementById("workspace-task-details-separator"));
  }, []);

  useEffect(() => {
    if (taskToRefocus.current === null) return;

    taskElements.current.get(taskToRefocus.current)?.focus();
    taskToRefocus.current = null;
  }, [tasks]);

  const moveTask = (taskId: string, status: TaskStatus) => {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task || task.status === status) return;

    onTasksChange(
      tasks.map((currentTask) =>
        currentTask.id === taskId ? { ...currentTask, status } : currentTask,
      ),
    );
  };

  const commitDraft = (title: string, status: TaskStatus) => {
    const taskTitle = title.trim();
    if (!taskTitle || draftCommitted.current) return;

    draftCommitted.current = true;
    onTasksChange([...tasks, { id: crypto.randomUUID(), title: taskTitle, status }]);
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
                    if (taskId) moveTask(taskId, status);
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
                        <article
                          className={styles.task}
                          key={task.id}
                          ref={(element) => {
                            if (element) {
                              taskElements.current.set(task.id, element);
                            } else {
                              taskElements.current.delete(task.id);
                            }
                          }}
                          draggable
                          tabIndex={0}
                          role="button"
                          aria-expanded={selectedTaskId === task.id}
                          aria-label={`${task.title}, ${labels.statusLabels[status]}`}
                          aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
                          onContextMenu={(event) => onContextMenu(event, task.id)}
                          onClick={() => setSelectedTaskId(task.id)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", task.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedTaskId(task.id);
                              return;
                            }
                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

                            const statusIndex = TASK_STATUSES.indexOf(status);
                            const nextIndex = statusIndex + (event.key === "ArrowRight" ? 1 : -1);
                            const nextStatus = TASK_STATUSES[nextIndex];
                            if (!nextStatus) return;

                            event.preventDefault();
                            taskToRefocus.current = task.id;
                            moveTask(task.id, nextStatus);
                          }}
                        >
                          <p>{task.title}</p>
                        </article>
                      ))}
                    </div>
                  )}

                  {activeColumn === status ? (
                    <form
                      className={styles.createForm}
                      onSubmit={(event) => handleCreateTask(event, status)}
                    >
                      <input
                        className={styles.taskInput}
                        autoFocus
                        value={draftTitle}
                        maxLength={200}
                        placeholder={labels.taskPlaceholder}
                        aria-label={labels.taskPlaceholder}
                        onChange={(event) => setDraftTitle(event.currentTarget.value)}
                        onBlur={(event) => {
                          const title = event.currentTarget.value;
                          if (title.trim()) {
                            commitDraft(title, status);
                          } else {
                            setActiveColumn(null);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") return;

                          event.preventDefault();
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
              onPointerCancel={stopThumbDraggingCancel}
            />
          </div>
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
              onTaskChange={(taskId, changes) =>
                onTasksChange(
                  tasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
                )
              }
            />,
            taskDetailsTarget,
          )
        : null}
      {contextMenu}
    </div>
  );
});
