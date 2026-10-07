import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Task } from "../../../features/tasks/taskStorage";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const STORAGE_KEY = "iridium.task-details.v1";
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 1200;
const DEFAULT_PANEL_WIDTH = 400;

function parseTaskDetailsPreference(
  savedPreference: string | null,
  tasks: Task[],
): { selectedTaskId: string | null; panelWidth: number | null } {
  if (savedPreference === null) {
    return { selectedTaskId: null, panelWidth: null };
  }

  try {
    const parsedPreference: unknown = JSON.parse(savedPreference);
    if (
      typeof parsedPreference !== "object" ||
      parsedPreference === null ||
      !("isOpen" in parsedPreference) ||
      typeof parsedPreference.isOpen !== "boolean" ||
      !("taskId" in parsedPreference) ||
      (parsedPreference.taskId !== null && typeof parsedPreference.taskId !== "string") ||
      !("width" in parsedPreference) ||
      typeof parsedPreference.width !== "number" ||
      !Number.isFinite(parsedPreference.width) ||
      parsedPreference.width < MIN_PANEL_WIDTH ||
      parsedPreference.width > MAX_PANEL_WIDTH
    ) {
      throw new Error("Saved task details preference has an invalid format.");
    }

    const savedTaskId = parsedPreference.taskId;
    const validTaskId =
      parsedPreference.isOpen &&
      typeof savedTaskId === "string" &&
      tasks.some((task) => task.id === savedTaskId)
        ? savedTaskId
        : null;

    return {
      selectedTaskId: validTaskId,
      panelWidth: parsedPreference.width,
    };
  } catch (error) {
    console.error("Could not load task details preference.", error);
    return { selectedTaskId: null, panelWidth: null };
  }
}

interface TaskDetailsPreferenceState {
  selectedTaskId: string | null;
  panelWidth: number | null;
}

export function useTaskDetailsPreference(taskListId: string, tasks: Task[]) {
  const [preference, setPreference] = useState<TaskDetailsPreferenceState>(() => {
    if (typeof window === "undefined") {
      return { selectedTaskId: null, panelWidth: null };
    }
    return parseTaskDetailsPreference(localStorage.getItem(`${STORAGE_KEY}.${taskListId}`), tasks);
  });

  const setSelectedTaskId = useCallback((selectedTaskId: string | null) => {
    setPreference((current) =>
      current.selectedTaskId === selectedTaskId ? current : { ...current, selectedTaskId },
    );
  }, []);

  const setPanelWidth = useCallback((panelWidth: number | null) => {
    setPreference((current) =>
      current.panelWidth === panelWidth ? current : { ...current, panelWidth },
    );
  }, []);

  const isFirstRender = useRef(true);

  useIsomorphicLayoutEffect(() => {
    const workspace = document
      .getElementById("workspace-task-details")
      ?.closest<HTMLElement>("[data-workspace]");
    if (!workspace) return;

    if (preference.panelWidth !== null) {
      workspace.style.setProperty("--task-details-width", `${preference.panelWidth}px`);
    }

    if (!workspace.hasAttribute("data-task-details-restoring")) {
      return;
    }

    void workspace.offsetWidth;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        workspace.removeAttribute("data-task-details-restoring");
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    if (preference.selectedTaskId === null) return;

    if (!tasks.some((task) => task.id === preference.selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [preference.selectedTaskId, setSelectedTaskId, tasks]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      localStorage.setItem(
        `${STORAGE_KEY}.${taskListId}`,
        JSON.stringify({
          isOpen: preference.selectedTaskId !== null,
          taskId: preference.selectedTaskId,
          width: preference.panelWidth ?? DEFAULT_PANEL_WIDTH,
        }),
      );
    } catch (error) {
      console.error("Could not save task details preference.", error);
    }
  }, [preference.panelWidth, preference.selectedTaskId, taskListId]);

  return {
    selectedTaskId: preference.selectedTaskId,
    setSelectedTaskId,
    panelWidth: preference.panelWidth,
    setPanelWidth,
  };
}
