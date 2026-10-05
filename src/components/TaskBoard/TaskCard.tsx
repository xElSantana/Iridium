import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { TASK_STATUSES, type TaskStatus } from "../../features/tasks/taskStorage";
import type { DropPosition } from "./useDragReorder";
import styles from "./TaskCard.module.css";

export interface TaskCardProps {
  id: string;
  title: string;
  status: TaskStatus;
  statusLabel: string;
  isSelected: boolean;
  isEditing: boolean;
  dropIndicator: DropPosition | null;
  registerTaskElement: (taskId: string, element: HTMLElement | null) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, taskId: string) => void;
  onSelect: (taskId: string) => void;
  onRename: (taskId: string, title: string) => void;
  onCancel: () => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onPrepareRefocus: (taskId: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragOver: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>, targetTaskId: string) => void;
}

export default memo(function TaskCard({
  id,
  title,
  status,
  statusLabel,
  isSelected,
  isEditing,
  dropIndicator,
  registerTaskElement,
  onContextMenu,
  onSelect,
  onRename,
  onCancel,
  onMove,
  onPrepareRefocus,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: TaskCardProps) {
  const [draftTitle, setDraftTitle] = useState(title);
  const cancelInFlightRef = useRef(false);
  const setTaskElement = useCallback(
    (element: HTMLElement | null) => registerTaskElement(id, element),
    [id, registerTaskElement],
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftTitle(title);
      cancelInFlightRef.current = false;
    }
  }, [isEditing, title]);

  if (isEditing) {
    return (
      <div
        className={`${styles.task} ${styles.taskEditing}${
          dropIndicator === "before" ? ` ${styles.dropBefore}` : ""
        }${dropIndicator === "after" ? ` ${styles.dropAfter}` : ""}`}
        ref={setTaskElement}
        role="presentation"
      >
        <input
          className={styles.taskInput}
          autoFocus
          value={draftTitle}
          maxLength={200}
          aria-label={title}
          onChange={(event) => setDraftTitle(event.currentTarget.value)}
          onBlur={() => {
            if (cancelInFlightRef.current) {
              cancelInFlightRef.current = false;
              return;
            }

            const nextTitle = draftTitle.trim();
            if (nextTitle && nextTitle !== title) {
              onRename(id, nextTitle);
            } else {
              if (!nextTitle) setDraftTitle(title);
              onCancel();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }

            if (event.key !== "Escape") return;

            event.preventDefault();
            cancelInFlightRef.current = true;
            setDraftTitle(title);
            onCancel();
            event.currentTarget.blur();
          }}
        />
      </div>
    );
  }

  return (
    <article
      className={`${styles.task}${dropIndicator === "before" ? ` ${styles.dropBefore}` : ""}${
        dropIndicator === "after" ? ` ${styles.dropAfter}` : ""
      }`}
      ref={setTaskElement}
      draggable
      tabIndex={0}
      role="button"
      aria-expanded={isSelected}
      aria-label={`${title}, ${statusLabel}`}
      aria-keyshortcuts="Enter Space ArrowLeft ArrowRight"
      onContextMenu={(event) => onContextMenu(event, id)}
      onClick={() => onSelect(id)}
      onDragStart={(event) => onDragStart(event, id)}
      onDragOver={(event) => onDragOver(event, id)}
      onDragLeave={(event) => onDragLeave(event)}
      onDrop={(event) => onDrop(event, id)}
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
