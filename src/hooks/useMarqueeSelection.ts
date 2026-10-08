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
  {
    allowShiftDragOnSelectableElements = false,
  }: { allowShiftDragOnSelectableElements?: boolean } = {},
) {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const isSelectingRef = useRef(false);
  const hasMadeSelectionRef = useRef(false);
  const startedShiftDragOnItemRef = useRef(false);
  const movedShiftDragOnItemRef = useRef(false);
  const suppressClickRef = useRef(false);

  const setSelection = useCallback(
    (ids: Iterable<T>) => {
      const nextSelection = new Set(ids);
      selectedIdsRef.current = nextSelection;
      setSelectedIds(nextSelection);
    },
    [setSelectedIds],
  );

  const clearSelection = useCallback(() => {
    setSelection([]);
  }, [setSelection]);

  useEffect(() => {
    const clearSelectionOutsideItems = (event: PointerEvent) => {
      suppressClickRef.current = false;
      const currentSelection = selectedIdsRef.current;
      const target = event.target;
      if (currentSelection.size === 0 || event.button !== 0 || !(target instanceof Node)) {
        return;
      }
      if (target instanceof Element && target.closest("[data-preserve-selection]")) {
        return;
      }

      const elements = getSelectableElements();
      const clickedSelectedItem = [...currentSelection].some((id) => {
        const element = elements.get(id);
        return element?.contains(target) ?? false;
      });

      if (!clickedSelectedItem) {
        setSelection([]);
      }
    };

    document.addEventListener("pointerdown", clearSelectionOutsideItems, true);
    return () => document.removeEventListener("pointerdown", clearSelectionOutsideItems, true);
  }, [getSelectableElements, setSelection]);

  useEffect(() => {
    const suppressMarqueeClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;

      suppressClickRef.current = false;
      const container = containerRef.current;
      if (!(event.target instanceof Node) || !container?.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("click", suppressMarqueeClick, true);
    return () => document.removeEventListener("click", suppressMarqueeClick, true);
  }, [containerRef]);

  const startSelection = useCallback(
    (event: React.MouseEvent) => {
      suppressClickRef.current = false;
      if (event.button !== 0) return;

      const target = event.target;
      const startedShiftDragOnItem =
        allowShiftDragOnSelectableElements &&
        event.shiftKey &&
        target instanceof Element &&
        [...getSelectableElements().values()].some(
          (element) => element === target || element.contains(target),
        );
      if (
        target instanceof Element &&
        target.closest("[data-no-marquee]") &&
        !startedShiftDragOnItem
      ) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const startX = event.clientX - rect.left + container.scrollLeft;
      const startY = event.clientY - rect.top + container.scrollTop;

      setSelection([]);
      hasMadeSelectionRef.current = false;
      startedShiftDragOnItemRef.current = startedShiftDragOnItem;
      movedShiftDragOnItemRef.current = false;
      isSelectingRef.current = true;
      setMarqueeRect({
        startX,
        startY,
        currentX: startX,
        currentY: startY,
      });
    },
    [allowShiftDragOnSelectableElements, containerRef, getSelectableElements, setSelection],
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

      if (
        startedShiftDragOnItemRef.current &&
        (Math.abs(currentX - currentRect.startX) >= 5 ||
          Math.abs(currentY - currentRect.startY) >= 5)
      ) {
        movedShiftDragOnItemRef.current = true;
      }

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

      setSelection(newSelectedIds);
    },
    [getSelectableElements, containerRef, marqueeRect, setSelection],
  );

  const endSelection = useCallback(() => {
    const currentRect = marqueeRect;
    isSelectingRef.current = false;
    setMarqueeRect(null);
    suppressClickRef.current = startedShiftDragOnItemRef.current && movedShiftDragOnItemRef.current;
    startedShiftDragOnItemRef.current = false;
    movedShiftDragOnItemRef.current = false;

    if (!currentRect) return;

    const movedDistance =
      Math.abs(currentRect.currentX - currentRect.startX) +
      Math.abs(currentRect.currentY - currentRect.startY);

    if (movedDistance < 5 && !hasMadeSelectionRef.current) {
      setSelection([]);
    }
  }, [marqueeRect, setSelection]);

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
    selectItems: setSelection,
    startSelection,
    marqueeStyle,
  };
}
