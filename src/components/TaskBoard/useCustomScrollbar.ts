import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

const CUSTOM_SCROLLBAR_MIN_THUMB = 24;
const CUSTOM_SCROLLBAR_ACTIVE_TIMEOUT = 900;

export function useCustomScrollbar() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeTimer = useRef<number | null>(null);
  const thumbWidth = useRef(0);
  const trackWidth = useRef(0);
  const maxScroll = useRef(0);
  const dragPointerId = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);

  const updateCustomScrollbar = useCallback(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const trackRect = track.getBoundingClientRect();
    const usableTrackWidth = Math.max(0, trackRect.width);

    maxScroll.current = maxScrollLeft;

    if (maxScrollLeft <= 0 || usableTrackWidth <= 0) {
      scroller.setAttribute("data-custom-scrollbar-hidden", "");
      thumbWidth.current = 0;
      trackWidth.current = usableTrackWidth;
      track.style.setProperty("--custom-scrollbar-thumb-width", "0px");
      track.style.setProperty("--custom-scrollbar-thumb-left", "0px");
      return;
    }

    scroller.removeAttribute("data-custom-scrollbar-hidden");
    const rawThumbWidth = (scroller.clientWidth / scroller.scrollWidth) * usableTrackWidth;
    const newThumbWidth = Math.min(
      usableTrackWidth,
      Math.max(CUSTOM_SCROLLBAR_MIN_THUMB, rawThumbWidth),
    );
    const maxThumbLeft = Math.max(0, usableTrackWidth - newThumbWidth);
    const newThumbLeft =
      maxThumbLeft === 0 ? 0 : (scroller.scrollLeft / maxScrollLeft) * maxThumbLeft;

    thumbWidth.current = newThumbWidth;
    trackWidth.current = usableTrackWidth;
    track.style.setProperty("--custom-scrollbar-thumb-width", `${newThumbWidth}px`);
    track.style.setProperty("--custom-scrollbar-thumb-left", `${newThumbLeft}px`);
  }, []);

  const setCustomScrollbarActive = useCallback(() => {
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
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const columns = columnsRef.current;
    if (!scroller || !columns) return;

    const onScroll = () => {
      setCustomScrollbarActive();
      updateCustomScrollbar();
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => updateCustomScrollbar());
    observer.observe(scroller);
    observer.observe(columns);

    updateCustomScrollbar();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (activeTimer.current !== null) {
        window.clearTimeout(activeTimer.current);
        activeTimer.current = null;
      }
    };
  }, [updateCustomScrollbar, setCustomScrollbarActive]);

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();

    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;
    if (maxScroll.current <= 0) return;

    const rect = track.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const currentTrackWidth = trackWidth.current;
    const currentThumbWidth = thumbWidth.current;
    const maxThumbLeft = Math.max(0, currentTrackWidth - currentThumbWidth);
    if (maxThumbLeft === 0) return;

    const requestedThumbLeft = Math.min(
      Math.max(pointerX - currentThumbWidth / 2, 0),
      maxThumbLeft,
    );
    scroller.scrollLeft = (requestedThumbLeft / maxThumbLeft) * maxScroll.current;
    setCustomScrollbarActive();
  };

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const scroller = scrollerRef.current;
    if (!scroller) return;

    dragPointerId.current = event.pointerId;
    dragStartX.current = event.clientX;
    dragStartScrollLeft.current = scroller.scrollLeft;
    event.currentTarget.setPointerCapture(event.pointerId);
    scroller.setAttribute("data-custom-scrollbar-dragging", "");
    setCustomScrollbarActive();
  };

  const onThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerId.current !== event.pointerId) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();

    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (maxScroll.current <= 0) return;

    const currentTrackWidth = trackWidth.current;
    const currentThumbWidth = thumbWidth.current;
    const maxThumbLeft = Math.max(0, currentTrackWidth - currentThumbWidth);
    if (maxThumbLeft === 0) return;

    const deltaX = event.clientX - dragStartX.current;
    const scrollPerPixel = maxScroll.current / maxThumbLeft;
    scroller.scrollLeft = dragStartScrollLeft.current + deltaX * scrollPerPixel;
    setCustomScrollbarActive();
  };

  const stopThumbDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (
      dragPointerId.current === event.pointerId &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragPointerId.current = null;
    scroller.removeAttribute("data-custom-scrollbar-dragging");
    setCustomScrollbarActive();
  };

  return {
    scrollerRef,
    columnsRef,
    trackRef,
    onTrackPointerDown,
    onThumbPointerDown,
    onThumbPointerMove,
    onThumbPointerUp: stopThumbDragging,
    onThumbPointerCancel: stopThumbDragging,
  };
}
