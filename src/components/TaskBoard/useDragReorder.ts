import { useCallback, useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import type { Task } from "../../features/tasks/taskStorage";

export type DropPosition = "before" | "after";

const DRAG_SCROLL_EDGE_SIZE = 56;
const DRAG_SCROLL_MAX_SPEED = 840;
const DRAG_SCROLL_MAX_FRAME_TIME = 32;

export function useDragReorder(
  onTasksChange: (updateTasks: (tasks: Task[]) => Task[]) => void,
  scrollerRef: RefObject<HTMLDivElement | null>,
) {
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("after");
  const dragPointerY = useRef<number | null>(null);
  const animationFrame = useRef<number | null>(null);
  const previousFrameTime = useRef<number | null>(null);

  const stopAutoScroll = useCallback(() => {
    dragPointerY.current = null;
    previousFrameTime.current = null;
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  }, []);

  const runAutoScroll = useCallback(
    function scrollAtEdge(timestamp: number) {
      animationFrame.current = null;
      const scroller = scrollerRef.current;
      const pointerY = dragPointerY.current;
      if (!scroller || pointerY === null) return;

      const { top, bottom } = scroller.getBoundingClientRect();
      const distanceFromTop = pointerY - top;
      const distanceFromBottom = bottom - pointerY;
      const edgeDistance = Math.min(distanceFromTop, distanceFromBottom);
      if (edgeDistance >= DRAG_SCROLL_EDGE_SIZE) {
        previousFrameTime.current = null;
        return;
      }

      const intensity = Math.min(1, 1 - Math.max(0, edgeDistance) / DRAG_SCROLL_EDGE_SIZE);
      const direction = distanceFromTop < distanceFromBottom ? -1 : 1;
      const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
      if (
        (direction < 0 && scroller.scrollTop <= 0) ||
        (direction > 0 && scroller.scrollTop >= maxScrollTop)
      ) {
        previousFrameTime.current = null;
        return;
      }

      const elapsed =
        previousFrameTime.current === null
          ? 16
          : Math.min(timestamp - previousFrameTime.current, DRAG_SCROLL_MAX_FRAME_TIME);
      previousFrameTime.current = timestamp;
      scroller.scrollTop += direction * DRAG_SCROLL_MAX_SPEED * intensity * (elapsed / 1000);
      animationFrame.current = requestAnimationFrame(scrollAtEdge);
    },
    [scrollerRef],
  );

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

  const handleBoardDragOverCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("text/plain")) return;

      const scroller = scrollerRef.current;
      if (!scroller) return;

      const { top, bottom } = scroller.getBoundingClientRect();
      const distanceFromTop = event.clientY - top;
      const distanceFromBottom = bottom - event.clientY;
      const edgeDistance = Math.min(distanceFromTop, distanceFromBottom);
      dragPointerY.current = event.clientY;
      if (edgeDistance >= DRAG_SCROLL_EDGE_SIZE) {
        previousFrameTime.current = null;
        return;
      }

      if (animationFrame.current === null) {
        previousFrameTime.current = null;
        animationFrame.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll, scrollerRef],
  );

  const handleBoardDragLeaveCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      stopAutoScroll();
    },
    [stopAutoScroll],
  );

  useEffect(() => {
    document.addEventListener("dragend", stopAutoScroll);
    return () => {
      document.removeEventListener("dragend", stopAutoScroll);
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

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
    handleBoardDragOverCapture,
    handleBoardDragLeaveCapture,
    stopAutoScroll,
    handleCardDragLeave,
    handleCardDrop,
  };
}
