import { useCallback, useEffect, useState, type DragEvent, type RefObject } from "react";
import type { Task } from "../../../features/tasks/taskStorage";
import { useDragAutoScroll } from "../../../hooks/useDragAutoScroll";

export type DropPosition = "before" | "after";

export function useDragReorder(
  onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void,
  scrollerRef: RefObject<HTMLDivElement | null>,
  selectedCount: number,
  selectedIds: Set<string>,
  clearSelection: () => void,
) {
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("after");
  const { updateAutoScroll, stopAutoScroll } = useDragAutoScroll(scrollerRef);

  const clearDragOverTaskId = useCallback(() => {
    setDragOverTaskId(null);
  }, []);

  const reorderTask = useCallback(
    (draggedId: string, targetId: string, position: DropPosition) => {
      onTasksChange((currentTasks) => {
        const dragged = currentTasks.find((t) => t.id === draggedId);
        const target = currentTasks.find((t) => t.id === targetId);
        if (!dragged || !target || draggedId === targetId) return currentTasks;

        const without = currentTasks.filter((t) => t.id !== draggedId);
        const targetIndex = without.findIndex((t) => t.id === targetId);
        const insertAt = position === "before" ? targetIndex : targetIndex + 1;
        const updatedTask =
          dragged.status !== target.status ? { ...dragged, status: target.status } : dragged;
        without.splice(insertAt, 0, updatedTask);
        return without;
      });
    },
    [onTasksChange],
  );

  const handleCardDragStart = useCallback(
    (event: DragEvent<HTMLElement>, taskId: string) => {
      if (selectedCount > 0 && selectedIds.has(taskId)) {
        event.dataTransfer.setData("text/plain", JSON.stringify(Array.from(selectedIds)));
      } else {
        event.dataTransfer.setData("text/plain", taskId);
      }
      event.dataTransfer.effectAllowed = "move";

      const el = event.currentTarget;
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.style.cssText = `opacity:0.5;position:absolute;top:-9999px;left:-9999px;width:${el.offsetWidth}px;pointer-events:none;`;
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    },
    [selectedCount, selectedIds],
  );

  const handleCardDragOver = useCallback((event: DragEvent<HTMLElement>, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: DropPosition = event.clientY < midY ? "before" : "after";
    setDragOverTaskId(taskId);
    setDropPosition(position);
  }, []);

  const handleBoardDragOverCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("text/plain")) return;

      updateAutoScroll(event.clientY);
    },
    [updateAutoScroll],
  );

  const handleBoardDragLeaveCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      stopAutoScroll();
    },
    [stopAutoScroll],
  );

  useEffect(() => {
    const handleDragEnd = () => {
      stopAutoScroll();
      setDragOverTaskId(null);
    };

    document.addEventListener("dragend", handleDragEnd);
    return () => {
      document.removeEventListener("dragend", handleDragEnd);
    };
  }, [stopAutoScroll]);

  const handleCardDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOverTaskId(null);
  }, []);

  const handleCardDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetTaskId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const data = event.dataTransfer.getData("text/plain");
      const rect = event.currentTarget.getBoundingClientRect();
      const position: DropPosition =
        event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setDragOverTaskId(null);

      if (!data) return;

      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          onTasksChange((currentTasks) => {
            const targetTask = currentTasks.find((t) => t.id === targetTaskId);
            if (!targetTask) return currentTasks;

            const toMove = currentTasks.filter((t) => parsed.includes(t.id));
            const remaining = currentTasks.filter((t) => !parsed.includes(t.id));
            const targetIndex = remaining.findIndex((t) => t.id === targetTaskId);
            const insertAt = position === "before" ? targetIndex : targetIndex + 1;

            const updated = toMove.map((task) =>
              task.status !== targetTask.status ? { ...task, status: targetTask.status } : task,
            );

            remaining.splice(insertAt, 0, ...updated);
            return remaining;
          });
          clearSelection();
          return;
        }
      } catch {
        const draggedId = data;
        if (draggedId === targetTaskId) return;
        reorderTask(draggedId, targetTaskId, position);
      }
    },
    [reorderTask, clearSelection, onTasksChange],
  );

  return {
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
  };
}
