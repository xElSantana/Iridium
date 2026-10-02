import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
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
  onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void;
  onBannerChange: (bannerId: TaskBackgroundId | null) => void;
}

interface TaskCardProps {
  id: string;
  title: string;
  status: TaskStatus;
  statusLabel: string;
  isSelected: boolean;
  registerTaskElement: (taskId: string, element: HTMLElement | null) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, taskId: string) => void;
  onSelect: (taskId: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onPrepareRefocus: (taskId: string) => void;
}

const TaskCard = memo(function TaskCard({
  id,
  title,
  status,
  statusLabel,
  isSelected,
  registerTaskElement,
  onContextMenu,
  onSelect,
  onMove,
  onPrepareRefocus,
}: TaskCardProps) {
  const setTaskElement = useCallback(
    (element: HTMLElement | null) => registerTaskElement(id, element),
    [id, registerTaskElement],
  );

  return (
    <article
      className={styles.task}
      ref={setTaskElement}
      draggable
      tabIndex={0}
      role="button"
      aria-expanded={isSelected}
      aria-label={`${title}, ${statusLabel}`}
      aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
      onContextMenu={(event) => onContextMenu(event, id)}
      onClick={() => onSelect(id)}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(id);
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

        const statusIndex = TASK_STATUSES.indexOf(status);
        const nextIndex = statusIndex + (event.key === "ArrowRight" ? 1 : -1);
        const nextStatus = TASK_STATUSES[nextIndex];
        if (!nextStatus) return;

        event.preventDefault();
        onPrepareRefocus(id);
        onMove(id, nextStatus);
      }}
    >
      <p>{title}</p>
    </article>
  );
});

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
        setTaskDetailsWidth(null);
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
        const task = currentTasks.find((currentTask) => currentTask.id === taskId);
        if (!task || task.status === status) return currentTasks;

        return currentTasks.map((currentTask) =>
          currentTask.id === taskId ? { ...currentTask, status } : currentTask,
        );
      });
    },
    [onTasksChange],
  );

  useEffect(() => {
    setTaskDetailsTarget(document.getElementById("workspace-task-details"));
    setTaskDetailsSeparator(document.getElementById("workspace-task-details-separator"));
  }, []);

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
                        <TaskCard
                          key={task.id}
                          id={task.id}
                          title={task.title}
                          status={status}
                          statusLabel={labels.statusLabels[status]}
                          isSelected={selectedTaskId === task.id}
                          registerTaskElement={registerTaskElement}
                          onContextMenu={onContextMenu}
                          onSelect={selectTask}
                          onMove={moveTask}
                          onPrepareRefocus={prepareTaskRefocus}
                        />
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
              onTaskChange={updateTaskDetails}
            />,
            taskDetailsTarget,
          )
        : null}
      {contextMenu}
    </div>
  );
});
