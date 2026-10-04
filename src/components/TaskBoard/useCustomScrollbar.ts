import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useCustomVerticalScrollbar } from "./useCustomVerticalScrollbar";

const CUSTOM_SCROLLBAR_MIN_THUMB = 24;

export function useCustomScrollbar() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const verticalTrackRef = useRef<HTMLDivElement>(null);
  const thumbWidth = useRef(0);
  const trackWidth = useRef(0);
  const maxScroll = useRef(0);
  const dragPointerId = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const {
    updateScrollbar: updateVerticalScrollbar,
    activateScrollbar: setCustomScrollbarActive,
    onTrackPointerDown: onVerticalTrackPointerDown,
    onThumbPointerDown: onVerticalThumbPointerDown,
    onThumbPointerMove: onVerticalThumbPointerMove,
    onThumbPointerUp: onVerticalThumbPointerUp,
    onKeyDown: onVerticalKeyDown,
  } = useCustomVerticalScrollbar(scrollerRef, verticalTrackRef);

  const updateCustomScrollbar = useCallback(() => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track) return;

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const trackRect = track.getBoundingClientRect();
    const usableTrackWidth = Math.max(0, Math.min(trackRect.width, scroller.clientWidth));

    maxScroll.current = maxScrollLeft;

    if (maxScrollLeft <= 0 || usableTrackWidth <= 0) {
      scroller.setAttribute("data-custom-scrollbar-hidden", "");
      thumbWidth.current = 0;
      trackWidth.current = usableTrackWidth;
      track.style.setProperty("--custom-scrollbar-thumb-width", "0px");
      track.style.setProperty("--custom-scrollbar-thumb-left", "0px");
    } else {
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
    }
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const columns = columnsRef.current;
    const verticalTrack = verticalTrackRef.current;
    if (!scroller || !columns || !verticalTrack) return;

    const onScroll = () => updateCustomScrollbar();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      updateCustomScrollbar();
      updateVerticalScrollbar();
    });
    observer.observe(scroller);
    observer.observe(columns);
    observer.observe(verticalTrack);
    updateCustomScrollbar();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [updateCustomScrollbar, updateVerticalScrollbar, verticalTrackRef]);

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
    verticalTrackRef,
    onTrackPointerDown,
    onThumbPointerDown,
    onThumbPointerMove,
    onThumbPointerUp: stopThumbDragging,
    onVerticalTrackPointerDown,
    onVerticalThumbPointerDown,
    onVerticalThumbPointerMove,
    onVerticalThumbPointerUp,
    onVerticalKeyDown,
  };
}
