import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { LuListTodo, LuPlus } from "react-icons/lu";
import { useContextMenu } from "../ContextMenu/useContextMenu";
import TaskBoard, { type TaskBoardLabels } from "../TaskBoard/TaskBoard";
import type { TaskBackgroundId } from "../../features/tasks/taskBackgrounds";
import {
  loadWorkspace,
  saveWorkspace,
  type TaskList,
  type WorkspaceData,
} from "../../features/tasks/taskStorage";
import styles from "./WorkspaceContent.module.css";

export interface WorkspaceContentLabels {
  addTemplate: string;
  deleteTaskList: string;
  sidebarPages: string;
  templateModalTitle: string;
  templateModalDescription: string;
  taskListTemplate: string;
  closeModal: string;
  loadError: string;
  saveError: string;
  taskBoard: TaskBoardLabels;
}

interface Props {
  labels: WorkspaceContentLabels;
}

const emptyWorkspace: WorkspaceData = {
  version: 1,
  taskLists: [],
  selectedTaskListId: null,
};

export default function WorkspaceContent({ labels }: Props) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [storageStatus, setStorageStatus] = useState<"loading" | "ready" | "load-error">("loading");
  const [saveError, setSaveError] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const skipNextSave = useRef(false);
  const pendingWorkspaceSave = useRef<WorkspaceData | null>(null);
  const saveTimer = useRef<number | null>(null);
  const loadError = storageStatus === "load-error";

  const flushPendingSave = useCallback((notify = true) => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    const pendingWorkspace = pendingWorkspaceSave.current;
    if (!pendingWorkspace) return;

    try {
      saveWorkspace(pendingWorkspace);
      pendingWorkspaceSave.current = null;
      if (notify) setSaveError(false);
    } catch (error) {
      console.error("Could not save workspace templates.", error);
      if (notify) setSaveError(true);
    }
  }, []);

  useEffect(() => {
    setSidebarTarget(document.getElementById("workspace-sidebar-content"));

    try {
      const loaded = loadWorkspace(labels.taskListTemplate);
      setWorkspace(loaded.workspace);
      skipNextSave.current = true;
      if (loaded.migrated) {
        try {
          saveWorkspace(loaded.workspace);
          setSaveError(false);
        } catch (error) {
          console.error("Could not save migrated workspace templates.", error);
          setSaveError(true);
        }
      }
      setStorageStatus("ready");
    } catch (error) {
      console.error("Could not load saved workspace templates.", error);
      setStorageStatus("load-error");
    }
  }, [labels.taskListTemplate]);

  useEffect(() => {
    if (storageStatus !== "ready") return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    pendingWorkspaceSave.current = workspace;
    saveTimer.current = window.setTimeout(flushPendingSave, 300);

    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [flushPendingSave, storageStatus, workspace]);

  useEffect(() => {
    const flushBeforeExit = () => flushPendingSave(false);
    window.addEventListener("pagehide", flushBeforeExit);
    return () => {
      window.removeEventListener("pagehide", flushBeforeExit);
      flushPendingSave(false);
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!isTemplateModalOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const regularFont = '400 1em "Comic Relief"';
    const boldFont = '700 1em "Comic Relief"';
    let cancelled = false;
    const openDialog = async () => {
      try {
        if (!document.fonts.check(regularFont) || !document.fonts.check(boldFont)) {
          await Promise.all([document.fonts.load(regularFont), document.fonts.load(boldFont)]);
        }
      } catch (error) {
        console.error("Could not load template dialog fonts.", error);
      }

      if (!cancelled) dialog.showModal();
    };

    void openDialog();
    return () => {
      cancelled = true;
      if (dialog.open) dialog.close();
    };
  }, [isTemplateModalOpen]);

  const selectedTaskList =
    workspace.taskLists.find((taskList) => taskList.id === workspace.selectedTaskListId) ?? null;
  const selectedTaskListId = selectedTaskList?.id;

  const handleTasksChange = useCallback(
    (tasks: TaskList["tasks"]) => {
      if (selectedTaskListId === undefined) return;

      setWorkspace((current) => ({
        ...current,
        taskLists: current.taskLists.map((taskList) =>
          taskList.id === selectedTaskListId ? { ...taskList, tasks } : taskList,
        ),
      }));
    },
    [selectedTaskListId],
  );

  const handleBannerChange = useCallback(
    (bannerId: TaskBackgroundId | null) => {
      if (selectedTaskListId === undefined) return;

      setWorkspace((current) => ({
        ...current,
        taskLists: current.taskLists.map((taskList) =>
          taskList.id === selectedTaskListId ? { ...taskList, bannerId } : taskList,
        ),
      }));
    },
    [selectedTaskListId],
  );

  const selectTaskList = (id: string) => {
    setWorkspace((current) =>
      current.selectedTaskListId === id ? current : { ...current, selectedTaskListId: id },
    );
  };

  const deleteTaskList = (id: string) => {
    setWorkspace((current) => {
      const taskLists = current.taskLists.filter((taskList) => taskList.id !== id);
      const selectedTaskListId =
        current.selectedTaskListId === id ? (taskLists[0]?.id ?? null) : current.selectedTaskListId;

      return { ...current, taskLists, selectedTaskListId };
    });
  };

  const { contextMenu, onContextMenu } = useContextMenu({
    label: labels.deleteTaskList,
    disabled: storageStatus !== "ready",
    onSelect: deleteTaskList,
  });

  const addTaskList = () => {
    setIsTemplateModalOpen(false);
    setWorkspace((current) => {
      const baseTitle = labels.taskListTemplate;
      const matchingTitles = current.taskLists.filter(
        (taskList) => taskList.title === baseTitle || taskList.title.startsWith(`${baseTitle} `),
      );
      const title =
        matchingTitles.length === 0 ? baseTitle : `${baseTitle} ${matchingTitles.length + 1}`;
      const taskList: TaskList = { id: crypto.randomUUID(), title, tasks: [] };

      return {
        ...current,
        taskLists: [...current.taskLists, taskList],
        selectedTaskListId: taskList.id,
      };
    });
  };

  const sidebar = sidebarTarget
    ? createPortal(
        <div className={styles.sidebarContent}>
          <nav aria-label={labels.sidebarPages}>
            <ul className={styles.taskListNavigation}>
              {workspace.taskLists.map((taskList) => (
                <li key={taskList.id}>
                  <button
                    className={styles.taskListLink}
                    type="button"
                    aria-label={taskList.title}
                    title={taskList.title}
                    aria-current={taskList.id === workspace.selectedTaskListId ? "page" : undefined}
                    onClick={() => selectTaskList(taskList.id)}
                    onContextMenu={(event) => onContextMenu(event, taskList.id)}
                  >
                    <LuListTodo aria-hidden="true" />
                    <span data-sidebar-label>{taskList.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <button
            className={styles.addTemplate}
            type="button"
            aria-label={labels.addTemplate}
            title={labels.addTemplate}
            disabled={loadError}
            onClick={() => setIsTemplateModalOpen(true)}
          >
            <LuPlus aria-hidden="true" />
            <span data-sidebar-label>{labels.addTemplate}</span>
          </button>
        </div>,
        sidebarTarget,
      )
    : null;

  return (
    <>
      {sidebar}
      {contextMenu}
      {storageStatus === "loading" ? null : loadError ? (
        <p className={styles.error} role="alert">
          {labels.loadError}
        </p>
      ) : (
        <>
          {saveError && (
            <p className={styles.error} role="alert">
              {labels.saveError}
            </p>
          )}
          {selectedTaskList ? (
            <TaskBoard
              key={selectedTaskList.id}
              title={selectedTaskList.title}
              tasks={selectedTaskList.tasks}
              bannerId={selectedTaskList.bannerId ?? null}
              labels={labels.taskBoard}
              onTasksChange={handleTasksChange}
              onBannerChange={handleBannerChange}
            />
          ) : null}
        </>
      )}

      <dialog
        className={styles.templateDialog}
        ref={dialogRef}
        aria-labelledby="template-dialog-title"
        onClose={() => {
          setIsTemplateModalOpen(false);
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsTemplateModalOpen(false);
        }}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="template-dialog-title">{labels.templateModalTitle}</h2>
            <p>{labels.templateModalDescription}</p>
          </div>
          <button
            className={styles.dialogCloseButton}
            type="button"
            aria-label={labels.closeModal}
            onClick={() => setIsTemplateModalOpen(false)}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>
        <button
          className={styles.templateOption}
          type="button"
          disabled={loadError}
          onClick={addTaskList}
        >
          <LuListTodo aria-hidden="true" />
          <span>{labels.taskListTemplate}</span>
        </button>
      </dialog>
    </>
  );
}
