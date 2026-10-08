import { useCallback, useEffect, useRef, useState } from "react";

interface MarqueeRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ElementRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function doRectsIntersect(
  marquee: { left: number; top: number; right: number; bottom: number },
  element: ElementRect,
): boolean {
  return !(
    marquee.right < element.left ||
    marquee.left > element.right ||
    marquee.bottom < element.top ||
    marquee.top > element.bottom
  );
}

export function useMarqueeSelection<T extends string>(
  containerRef: React.RefObject<HTMLElement | null>,
  getSelectableElements: () => Map<T, HTMLElement>,
) {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const isSelectingRef = useRef(false);
  const hasMadeSelectionRef = useRef(false);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const startSelection = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-no-marquee]")) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const startX = event.clientX - rect.left + container.scrollLeft;
      const startY = event.clientY - rect.top + container.scrollTop;

      setSelectedIds(new Set());
      hasMadeSelectionRef.current = false;
      isSelectingRef.current = true;
      setMarqueeRect({
        startX,
        startY,
        currentX: startX,
        currentY: startY,
      });
    },
    [containerRef],
  );

  const updateSelection = useCallback(
    (event: MouseEvent) => {
      if (!isSelectingRef.current) return;

      const container = containerRef.current;
      const currentRect = marqueeRect;
      if (!container || !currentRect) return;

      const rect = container.getBoundingClientRect();
      const currentX = event.clientX - rect.left + container.scrollLeft;
      const currentY = event.clientY - rect.top + container.scrollTop;

      setMarqueeRect({ ...currentRect, currentX, currentY });

      const elements = getSelectableElements();
      const elementRects: ElementRect[] = [];

      elements.forEach((element, id) => {
        const elemRect = element.getBoundingClientRect();
        elementRects.push({
          id,
          left: elemRect.left - rect.left + container.scrollLeft,
          top: elemRect.top - rect.top + container.scrollTop,
          right: elemRect.right - rect.left + container.scrollLeft,
          bottom: elemRect.bottom - rect.top + container.scrollTop,
        });
      });

      const marqueeBox = {
        left: Math.min(currentRect.startX, currentX),
        top: Math.min(currentRect.startY, currentY),
        right: Math.max(currentRect.startX, currentX),
        bottom: Math.max(currentRect.startY, currentY),
      };

      const newSelectedIds = new Set<T>();
      elementRects.forEach((elemRect) => {
        if (doRectsIntersect(marqueeBox, elemRect)) {
          newSelectedIds.add(elemRect.id as T);
        }
      });

      if (newSelectedIds.size > 0) {
        hasMadeSelectionRef.current = true;
      }

      setSelectedIds(newSelectedIds);
    },
    [getSelectableElements, containerRef, marqueeRect],
  );

  const endSelection = useCallback(() => {
    const currentRect = marqueeRect;
    isSelectingRef.current = false;
    setMarqueeRect(null);

    if (!currentRect) return;

    const movedDistance =
      Math.abs(currentRect.currentX - currentRect.startX) +
      Math.abs(currentRect.currentY - currentRect.startY);

    if (movedDistance < 5 && !hasMadeSelectionRef.current) {
      setSelectedIds(new Set());
    }
  }, [marqueeRect]);

  useEffect(() => {
    if (!isSelectingRef.current) return;

    document.addEventListener("mousemove", updateSelection);
    document.addEventListener("mouseup", endSelection);

    return () => {
      document.removeEventListener("mousemove", updateSelection);
      document.removeEventListener("mouseup", endSelection);
    };
  }, [updateSelection, endSelection]);

  const marqueeStyle =
    marqueeRect !== null
      ? {
          left: Math.min(marqueeRect.startX, marqueeRect.currentX),
          top: Math.min(marqueeRect.startY, marqueeRect.currentY),
          width: Math.abs(marqueeRect.currentX - marqueeRect.startX),
          height: Math.abs(marqueeRect.currentY - marqueeRect.startY),
        }
      : null;

  const isSelected = useCallback(
    (id: T) => {
      return selectedIds.has(id);
    },
    [selectedIds],
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    clearSelection,
    startSelection,
    marqueeStyle,
  };
}
