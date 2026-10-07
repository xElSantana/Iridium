import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const CUSTOM_SCROLLBAR_MIN_THUMB = 24;
const CUSTOM_SCROLLBAR_ACTIVE_TIMEOUT = 900;

export function useCustomVerticalScrollbar(
  scrollerRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
) {
  const activeTimer = useRef<number | null>(null);
  const thumbHeight = useRef(0);
  const trackHeight = useRef(0);
  const maxScroll = useRef(0);
  const dragPointerId = useRef<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);
  const attachedScroller = useRef<HTMLElement | null>(null);

  const scrollHandlerRef = useRef<() => void>(() => {});

  const onScroll = useCallback(() => {
    scrollHandlerRef.current();
  }, []);

  const attachScroller = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller && scroller !== attachedScroller.current) {
      if (attachedScroller.current) {
        attachedScroller.current.removeEventListener("scroll", onScroll);
      }
      scroller.addEventListener("scroll", onScroll, { passive: true });
      attachedScroller.current = scroller;
    }
  }, [onScroll, scrollerRef]);

  const updateScrollbar = useCallback(() => {
    attachScroller();
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
    const usableTrackHeight = track.clientHeight;
    maxScroll.current = maxScrollTop;

    if (maxScrollTop <= 0 || usableTrackHeight <= 0) {
      scroller.setAttribute("data-custom-vertical-scrollbar-hidden", "");
      thumbHeight.current = 0;
      trackHeight.current = usableTrackHeight;
      track.style.setProperty("--custom-scrollbar-thumb-height", "0px");
      track.style.setProperty("--custom-scrollbar-thumb-top", "0px");
      track.setAttribute("aria-valuemax", String(Math.max(0, Math.round(maxScrollTop))));
      track.setAttribute("aria-valuenow", String(Math.round(scroller.scrollTop)));
      return;
    }

    scroller.removeAttribute("data-custom-vertical-scrollbar-hidden");
    const rawThumbHeight = (scroller.clientHeight / scroller.scrollHeight) * usableTrackHeight;
    const newThumbHeight = Math.min(
      usableTrackHeight,
      Math.max(CUSTOM_SCROLLBAR_MIN_THUMB, rawThumbHeight),
    );
    const maxThumbTop = Math.max(0, usableTrackHeight - newThumbHeight);
    const newThumbTop = maxThumbTop === 0 ? 0 : (scroller.scrollTop / maxScrollTop) * maxThumbTop;

    thumbHeight.current = newThumbHeight;
    trackHeight.current = usableTrackHeight;
    track.style.setProperty("--custom-scrollbar-thumb-height", `${newThumbHeight}px`);
    track.style.setProperty("--custom-scrollbar-thumb-top", `${newThumbTop}px`);
    track.setAttribute("aria-valuemax", String(Math.round(maxScrollTop)));
    track.setAttribute("aria-valuenow", String(Math.round(scroller.scrollTop)));
  }, [attachScroller, scrollerRef, trackRef]);

  const activateScrollbar = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    scroller.setAttribute("data-custom-scrollbar-active", "");
    if (activeTimer.current !== null) {
      window.clearTimeout(activeTimer.current);
    }
    activeTimer.current = window.setTimeout(() => {
      scroller.removeAttribute("data-custom-scrollbar-active");
      activeTimer.current = null;
    }, CUSTOM_SCROLLBAR_ACTIVE_TIMEOUT);
  }, [scrollerRef]);

  scrollHandlerRef.current = () => {
    activateScrollbar();
    updateScrollbar();
  };

  useEffect(() => {
    attachScroller();
    updateScrollbar();

    const scroller = scrollerRef.current;
    const track = trackRef.current;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateScrollbar();
      });
      if (scroller) resizeObserver.observe(scroller);
      if (track) resizeObserver.observe(track);
    }

    return () => {
      if (attachedScroller.current) {
        attachedScroller.current.removeEventListener("scroll", onScroll);
        attachedScroller.current = null;
      }
      resizeObserver?.disconnect();
      if (activeTimer.current !== null) {
        window.clearTimeout(activeTimer.current);
        activeTimer.current = null;
      }
    };
  }, [attachScroller, onScroll, scrollerRef, trackRef, updateScrollbar]);

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.preventDefault();

    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || maxScroll.current <= 0) return;

    const pointerY = event.clientY - track.getBoundingClientRect().top;
    const maxThumbTop = Math.max(0, trackHeight.current - thumbHeight.current);
    if (maxThumbTop === 0) return;

    const requestedThumbTop = Math.min(
      Math.max(pointerY - thumbHeight.current / 2, 0),
      maxThumbTop,
    );
    scroller.scrollTop = (requestedThumbTop / maxThumbTop) * maxScroll.current;
    activateScrollbar();
  };

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const scroller = scrollerRef.current;
    if (!scroller) return;

    dragPointerId.current = event.pointerId;
    dragStartY.current = event.clientY;
    dragStartScrollTop.current = scroller.scrollTop;
    event.currentTarget.setPointerCapture(event.pointerId);
    scroller.setAttribute("data-custom-vertical-scrollbar-dragging", "");
    activateScrollbar();
  };

  const onThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();

    const scroller = scrollerRef.current;
    if (!scroller || maxScroll.current <= 0) return;

    const maxThumbTop = Math.max(0, trackHeight.current - thumbHeight.current);
    if (maxThumbTop === 0) return;

    const deltaY = event.clientY - dragStartY.current;
    const scrollPerPixel = maxScroll.current / maxThumbTop;
    scroller.scrollTop = dragStartScrollTop.current + deltaY * scrollPerPixel;
    activateScrollbar();
  };

  const onThumbPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (
      dragPointerId.current === event.pointerId &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragPointerId.current = null;
    scroller.removeAttribute("data-custom-vertical-scrollbar-dragging");
    activateScrollbar();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const pageStep = scroller.clientHeight * 0.8;
    const steps: Record<string, number> = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: pageStep,
      PageUp: -pageStep,
      End: scroller.scrollHeight,
      Home: -scroller.scrollHeight,
    };
    const step = steps[event.key];
    if (step === undefined) return;

    event.preventDefault();
    scroller.scrollTop =
      event.key === "End"
        ? scroller.scrollHeight
        : event.key === "Home"
          ? 0
          : scroller.scrollTop + step;
  };

  return {
    updateScrollbar,
    activateScrollbar,
    onTrackPointerDown,
    onThumbPointerDown,
    onThumbPointerMove,
    onThumbPointerUp,
    onKeyDown,
  };
}
