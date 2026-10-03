import { memo, useCallback, type DragEvent, type MouseEvent } from "react";
import { TASK_STATUSES, type TaskStatus } from "../../features/tasks/taskStorage";
import type { DropPosition } from "./useDragReorder";
import styles from "./TaskCard.module.css";

export interface TaskCardProps {
  id: string;
  title: string;
  status: TaskStatus;
  statusLabel: string;
  isSelected: boolean;
  dropIndicator: DropPosition | null;
  registerTaskElement: (taskId: string, element: HTMLElement | null) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, taskId: string) => void;
  onSelect: (taskId: string) => void;
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
  dropIndicator,
  registerTaskElement,
  onContextMenu,
  onSelect,
  onMove,
  onPrepareRefocus,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: TaskCardProps) {
  const setTaskElement = useCallback(
    (element: HTMLElement | null) => registerTaskElement(id, element),
    [id, registerTaskElement],
  );

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
