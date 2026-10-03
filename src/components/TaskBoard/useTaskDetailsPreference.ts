import { useEffect, useRef, useState } from "react";
import type { Task } from "../../features/tasks/taskStorage";

const STORAGE_KEY = "iridium.task-details.v1";
const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 1200;
const DEFAULT_PANEL_WIDTH = 400;

export function useTaskDetailsPreference(taskListId: string, tasks: Task[]) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const preferenceRead = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (preferenceRead.current) return;
    preferenceRead.current = true;

    try {
      const savedPreference = localStorage.getItem(`${STORAGE_KEY}.${taskListId}`);
      if (savedPreference !== null) {
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
          tasksRef.current.some((task) => task.id === savedTaskId)
            ? savedTaskId
            : null;
        setSelectedTaskId(validTaskId);
        setPanelWidth(parsedPreference.width);
      }
    } catch (error) {
      console.error("Could not load task details preference.", error);
    } finally {
      setIsLoaded(true);
    }
  }, [taskListId]);

  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(
        `${STORAGE_KEY}.${taskListId}`,
        JSON.stringify({
          isOpen: selectedTaskId !== null,
          taskId: selectedTaskId,
          width: panelWidth ?? DEFAULT_PANEL_WIDTH,
        }),
      );
    } catch (error) {
      console.error("Could not save task details preference.", error);
    }
  }, [isLoaded, panelWidth, selectedTaskId, taskListId]);

  return {
    selectedTaskId,
    setSelectedTaskId,
    panelWidth,
    setPanelWidth,
  };
}
