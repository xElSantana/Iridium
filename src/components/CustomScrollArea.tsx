import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

interface CustomScrollAreaProps {
  children: ReactNode;
  label: string;
  className?: string;
  contentClassName?: string;
}

interface ScrollMetrics {
  isScrollable: boolean;
  thumbHeight: number;
  thumbOffset: number;
  scrollTop: number;
  maxScroll: number;
}

interface DragState {
  pointerId: number;
  startY: number;
  startScrollTop: number;
}

const EMPTY_METRICS: ScrollMetrics = {
  isScrollable: false,
  thumbHeight: 0,
  thumbOffset: 0,
  scrollTop: 0,
  maxScroll: 0,
};

function getScrollMetrics(viewport: HTMLDivElement | null): ScrollMetrics {
  if (!viewport || viewport.clientHeight === 0) return EMPTY_METRICS;

  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  if (maxScroll <= 0) return EMPTY_METRICS;

  const thumbHeight = Math.min(
    viewport.clientHeight,
    Math.max(24, (viewport.clientHeight / viewport.scrollHeight) * viewport.clientHeight),
  );

  return {
    isScrollable: true,
    thumbHeight,
    thumbOffset: (viewport.scrollTop / maxScroll) * (viewport.clientHeight - thumbHeight),
    scrollTop: viewport.scrollTop,
    maxScroll,
  };
}

export default function CustomScrollArea({
  children,
  label,
  className = "",
  contentClassName = "",
}: CustomScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const viewportId = useId();
  const [metrics, setMetrics] = useState(EMPTY_METRICS);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      setMetrics(getScrollMetrics(viewport));
    });
    observer.observe(viewport);
    if (content) observer.observe(content);
    setMetrics(getScrollMetrics(viewport));

    return () => observer.disconnect();
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const maxThumbOffset = viewport.clientHeight - metrics.thumbHeight;
    if (maxThumbOffset <= 0) return;

    const thumbOffset = Math.min(
      maxThumbOffset,
      Math.max(0, event.clientY - bounds.top - metrics.thumbHeight / 2),
    );
    viewport.scrollTop = (thumbOffset / maxThumbOffset) * metrics.maxScroll;
  };

  const handleThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: viewportRef.current?.scrollTop ?? 0,
    };
  };

  const handleThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport) return;

    const maxThumbOffset = viewport.clientHeight - metrics.thumbHeight;
    if (maxThumbOffset <= 0) return;

    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTop =
      drag.startScrollTop + ((event.clientY - drag.startY) / maxThumbOffset) * maxScroll;
  };

  const handleThumbPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleThumbKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const pageStep = viewport.clientHeight * 0.9;
    const steps: Record<string, number> = {
      ArrowDown: 40,
      ArrowUp: -40,
      PageDown: pageStep,
      PageUp: -pageStep,
    };

    if (event.key === "Home") {
      viewport.scrollTop = 0;
    } else if (event.key === "End") {
      viewport.scrollTop = viewport.scrollHeight;
    } else if (event.key in steps) {
      viewport.scrollTop += steps[event.key];
    } else {
      return;
    }

    event.preventDefault();
  };

  return (
    <div className={`custom-scroll-area ${className}`}>
      <div
        ref={viewportRef}
        id={viewportId}
        className="custom-scroll-area__viewport"
        role="region"
        aria-label={label}
        onScroll={() => setMetrics(getScrollMetrics(viewportRef.current))}
      >
        <div ref={contentRef} className={`custom-scroll-area__content ${contentClassName}`}>
          {children}
        </div>
      </div>
      {metrics.isScrollable && (
        <div className="custom-scroll-area__track" onPointerDown={handlePointerDown}>
          <div
            className="custom-scroll-area__thumb"
            role="scrollbar"
            tabIndex={0}
            aria-label={label}
            aria-controls={viewportId}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={Math.round(metrics.maxScroll)}
            aria-valuenow={Math.round(metrics.scrollTop)}
            style={{
              height: metrics.thumbHeight,
              transform: `translateY(${metrics.thumbOffset}px)`,
            }}
            onPointerDown={handleThumbPointerDown}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerEnd}
            onPointerCancel={handleThumbPointerEnd}
            onKeyDown={handleThumbKeyDown}
          />
        </div>
      )}
    </div>
  );
}
