import { useCallback, useState, type DragEvent } from "react";
import type { Task } from "../../features/tasks/taskStorage";

export type DropPosition = "before" | "after";

export function useDragReorder(onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void) {
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("after");

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

  const handleCardDragStart = useCallback((event: DragEvent<HTMLElement>, taskId: string) => {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";

    const el = event.currentTarget as HTMLElement;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.style.cssText = `opacity:0.5;position:absolute;top:-9999px;left:-9999px;width:${el.offsetWidth}px;pointer-events:none;`;
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }, []);

  const handleCardDragOver = useCallback((event: DragEvent<HTMLElement>, taskId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: DropPosition = event.clientY < midY ? "before" : "after";
    setDragOverTaskId(taskId);
    setDropPosition(position);
  }, []);

  const handleCardDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
    setDragOverTaskId(null);
  }, []);

  const handleCardDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetTaskId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedId = event.dataTransfer.getData("text/plain");
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const position: DropPosition =
        event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setDragOverTaskId(null);
      if (!draggedId || draggedId === targetTaskId) return;
      reorderTask(draggedId, targetTaskId, position);
    },
    [reorderTask],
  );

  return {
    dragOverTaskId,
    dropPosition,
    clearDragOverTaskId,
    handleCardDragStart,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
  };
}
