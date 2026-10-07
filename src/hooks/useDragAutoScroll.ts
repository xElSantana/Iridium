import { useCallback, useEffect, useRef, type RefObject } from "react";

const DRAG_SCROLL_EDGE_SIZE = 56;
const DRAG_SCROLL_MAX_SPEED = 840;
const DRAG_SCROLL_MAX_FRAME_TIME = 32;

export function useDragAutoScroll<T extends HTMLElement>(scrollerRef: RefObject<T | null>) {
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

  const updateAutoScroll = useCallback(
    (pointerY: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const { top, bottom } = scroller.getBoundingClientRect();
      if (pointerY < top || pointerY > bottom) {
        stopAutoScroll();
        return;
      }

      const edgeDistance = Math.min(pointerY - top, bottom - pointerY);
      dragPointerY.current = pointerY;
      if (edgeDistance >= DRAG_SCROLL_EDGE_SIZE) {
        previousFrameTime.current = null;
        return;
      }

      if (animationFrame.current === null) {
        previousFrameTime.current = null;
        animationFrame.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll, scrollerRef, stopAutoScroll],
  );

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  return { updateAutoScroll, stopAutoScroll };
}
