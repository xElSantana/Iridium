import "@blocknote/mantine/style.css";
import { es } from "@blocknote/core/locales";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { createPortal } from "react-dom";
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiChevronsRight, FiMaximize2, FiMinimize2, FiMoreVertical } from "react-icons/fi";
import type { Task } from "../../features/tasks/taskStorage";
import { createTaskMediaStorage } from "../../features/tasks/taskMediaStorage";
import { useCustomVerticalScrollbar } from "./useCustomVerticalScrollbar";
import styles from "./TaskDetails.module.css";

const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 1200;
const DEFAULT_PANEL_WIDTH = 400;
const CLOSE_TRANSITION_FALLBACK = 320;

const blockNoteTheme = {
  colors: {
    editor: {
      text: "var(--color-text)",
      background: "var(--color-accent-soft)",
    },
    menu: {
      text: "var(--color-text)",
      background: "var(--color-accent-soft)",
    },
    tooltip: {
      text: "var(--color-text)",
      background: "var(--color-background)",
    },
    hovered: {
      text: "var(--color-text)",
      background: "color-mix(in srgb, var(--color-text) 12%, var(--color-accent-soft))",
    },
    selected: {
      text: "var(--color-text)",
      background: "color-mix(in srgb, var(--color-text) 16%, var(--color-accent-soft))",
    },
    disabled: {
      text: "color-mix(in srgb, var(--color-text) 45%, var(--color-accent-soft))",
      background: "var(--color-accent-soft)",
    },
    shadow: "var(--color-border)",
    border: "var(--color-border)",
    sideMenu: "var(--color-text)",
  },
  borderRadius: 6,
  fontFamily: "var(--font-family)",
} satisfies Theme;

const getMaximumPanelWidth = (panel: HTMLElement | null) => {
  const workspace = panel?.closest<HTMLElement>("[data-workspace]");
  const sidebar = workspace?.querySelector<HTMLElement>("#workspace-sidebar");
  const workspaceResizeHandle = workspace?.querySelector<HTMLElement>("[data-resize-handle]");
  const availableWidth =
    workspace && sidebar && workspaceResizeHandle
      ? workspace.clientWidth -
        6 -
        sidebar.getBoundingClientRect().width -
        workspaceResizeHandle.getBoundingClientRect().width -
        160 -
        4
      : (panel?.parentElement?.clientWidth ?? 0);

  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, availableWidth));
};

interface TaskDetailsProps {
  task: Task;
  titleLabel: string;
  closeLabel: string;
  toggleWidthLabel: string;
  resizeLabel: string;
  width: number | null;
  resizeTarget: HTMLElement;
  onClose: () => void;
  onResize: (width: number) => void;
  onTaskChange: (taskId: string, changes: Partial<Pick<Task, "title" | "content">>) => void;
}

type TaskEditor = ReturnType<typeof useCreateBlockNote>;

const TaskContent = memo(function TaskContent({
  editor,
  taskId,
  onTaskChange,
  mediaStorage,
}: {
  editor: TaskEditor;
  taskId: string;
  onTaskChange: TaskDetailsProps["onTaskChange"];
  mediaStorage: ReturnType<typeof createTaskMediaStorage>;
}) {
  return (
    <BlockNoteView
      className={styles.editor}
      editor={editor}
      theme={blockNoteTheme}
      onChange={() => {
        const content = editor.document;
        mediaStorage.retainFiles(content);
        onTaskChange(taskId, { content });
      }}
    />
  );
});

function TaskDetails({
  task,
  titleLabel,
  closeLabel,
  toggleWidthLabel,
  resizeLabel,
  width,
  resizeTarget,
  onClose,
  onResize,
  onTaskChange,
}: TaskDetailsProps) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [isClosing, setIsClosing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const {
    updateScrollbar,
    onTrackPointerDown: handleScrollbarTrackPointerDown,
    onThumbPointerDown: handleScrollbarThumbPointerDown,
    onThumbPointerMove: handleScrollbarThumbPointerMove,
    onThumbPointerUp: handleScrollbarThumbPointerUp,
    onKeyDown: handleScrollbarKeyDown,
  } = useCustomVerticalScrollbar(scrollContentRef, scrollbarRef);
  const maximumPanelWidth = useRef(MAX_PANEL_WIDTH);
  const resizeStart = useRef<{
    pointerId: number;
    x: number;
    width: number;
    currentWidth: number;
  } | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const resizeWorkspace = useRef<HTMLElement | null>(null);
  const mediaStorage = useMemo(createTaskMediaStorage, [task.id]);
  const editor = useCreateBlockNote(
    {
      initialContent: task.content?.length ? task.content : undefined,
      dictionary: es,
      dropCursor: { color: "var(--color-primary)" },
      uploadFile: mediaStorage.uploadFile,
      resolveFileUrl: mediaStorage.resolveFileUrl,
    },
    [task.id],
  );

  useLayoutEffect(() => {
    mediaStorage.activate(task.content);
    return () => mediaStorage.dispose();
  }, [mediaStorage]);

  useEffect(() => setTitleDraft(task.title), [task.title]);

  const adjustTitleHeight = () => {
    const titleInput = titleInputRef.current;
    if (!titleInput) return;

    titleInput.style.height = "auto";
    titleInput.style.height = `${titleInput.scrollHeight}px`;
  };

  useEffect(() => {
    adjustTitleHeight();
  }, [titleDraft]);

  useEffect(() => {
    const panel = panelRef.current;
    const scrollContent = scrollContentRef.current;
    if (!panel || !scrollContent) return;

    const onResizeEntry = () => {
      if (panel.hasAttribute("data-task-details-closing")) return;
      adjustTitleHeight();
      updateScrollbar();
    };

    const resizeObserver = new ResizeObserver(onResizeEntry);
    resizeObserver.observe(panel);
    resizeObserver.observe(scrollContent);

    let observedEditor: HTMLElement | null = null;
    const tryObserveEditor = () => {
      if (observedEditor) return;
      const editorContent = scrollContent.querySelector<HTMLElement>(".bn-editor");
      if (editorContent) {
        observedEditor = editorContent;
        resizeObserver.observe(editorContent);
      }
    };
    tryObserveEditor();

    const mutationObserver = new MutationObserver(() => {
      tryObserveEditor();
      updateScrollbar();
    });
    mutationObserver.observe(scrollContent, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const workspace = panel.closest<HTMLElement>("[data-workspace]");
    const onTransitionEnd = (event: TransitionEvent) => {
      if (
        event.target === workspace &&
        event.propertyName === "grid-template-columns" &&
        !panel.hasAttribute("data-task-details-closing")
      ) {
        adjustTitleHeight();
        updateScrollbar();
      }
    };
    workspace?.addEventListener("transitionend", onTransitionEnd);

    return () => {
      workspace?.removeEventListener("transitionend", onTransitionEnd);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateScrollbar]);

  const finishResize = () => {
    if (resizeFrame.current !== null) {
      window.cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
    }
    resizeWorkspace.current?.removeAttribute("data-task-details-resizing");
  };

  useEffect(() => () => finishResize(), []);

  useLayoutEffect(() => {
    const workspace = panelRef.current?.closest<HTMLElement>("[data-workspace]");
    workspace?.style.setProperty("--task-details-width", `${width ?? DEFAULT_PANEL_WIDTH}px`);
  }, [width]);

  useEffect(() => {
    const workspace = panelRef.current?.closest<HTMLElement>("[data-workspace]");
    return () => {
      queueMicrotask(() => {
        if (!workspace?.querySelector("[data-task-details]")) {
          workspace?.style.removeProperty("--task-details-width");
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!isClosing) return;

    const workspace = panelRef.current?.closest<HTMLElement>("[data-workspace]");
    if (!workspace) return;

    const finishClosing = () => onClose();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClosing();
      return;
    }

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === workspace && event.propertyName === "grid-template-columns") {
        finishClosing();
      }
    };

    workspace.addEventListener("transitionend", onTransitionEnd);
    const fallbackTimer = window.setTimeout(finishClosing, CLOSE_TRANSITION_FALLBACK);
    return () => {
      workspace.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallbackTimer);
    };
  }, [isClosing, onClose]);

  const currentWidthRef = useRef(width ?? DEFAULT_PANEL_WIDTH);
  currentWidthRef.current = width ?? DEFAULT_PANEL_WIDTH;

  useLayoutEffect(() => {
    const currentWidth = width ?? DEFAULT_PANEL_WIDTH;
    if (currentWidth > maximumPanelWidth.current) {
      onResize(maximumPanelWidth.current);
    }
  }, [width, onResize]);

  useLayoutEffect(() => {
    const workspace = panelRef.current?.closest<HTMLElement>("[data-workspace]");
    const updateBounds = () => {
      const maxWidth = getMaximumPanelWidth(panelRef.current);
      maximumPanelWidth.current = maxWidth;
      resizeHandleRef.current?.setAttribute("aria-valuemax", String(Math.round(maxWidth)));

      if (currentWidthRef.current > maxWidth) {
        onResize(maxWidth);
      }
    };

    updateBounds();
    const sidebar = workspace?.querySelector<HTMLElement>("#workspace-sidebar");
    const resizeObserver = new ResizeObserver(updateBounds);
    if (workspace) resizeObserver.observe(workspace);
    if (sidebar) resizeObserver.observe(sidebar);
    return () => {
      resizeObserver.disconnect();
    };
  }, [onResize, resizeTarget]);

  const resizePanel = (nextWidth: number) => {
    const panelWidth = Math.min(Math.max(nextWidth, MIN_PANEL_WIDTH), maximumPanelWidth.current);
    panelRef.current
      ?.closest<HTMLElement>("[data-workspace]")
      ?.style.setProperty("--task-details-width", `${panelWidth}px`);
    onResize(panelWidth);
  };

  return (
    <>
      <aside
        className={styles.taskDetails}
        data-task-details
        data-task-details-expanded={isExpanded || undefined}
        data-task-details-closing={isClosing || undefined}
        aria-hidden={isClosing}
        inert={isClosing}
        ref={panelRef}
        aria-label={task.title}
      >
        <div className={styles.taskDetailsContent} ref={scrollContentRef} id={panelId}>
          <header className={styles.taskDetailsHeader}>
            <div className={styles.taskDetailsActions}>
              <button
                className={styles.closeButton}
                type="button"
                aria-label={closeLabel}
                title={closeLabel}
                onClick={(event) => {
                  event.currentTarget.blur();
                  setIsClosing(true);
                }}
              >
                <FiChevronsRight aria-hidden="true" />
              </button>
              <button
                className={styles.closeButton}
                type="button"
                aria-label={toggleWidthLabel}
                title={toggleWidthLabel}
                aria-pressed={isExpanded}
                onClick={() => setIsExpanded((expanded) => !expanded)}
              >
                {isExpanded ? (
                  <FiMinimize2 aria-hidden="true" />
                ) : (
                  <FiMaximize2 aria-hidden="true" />
                )}
              </button>
            </div>
            <textarea
              className={styles.taskTitleInput}
              ref={titleInputRef}
              value={titleDraft}
              rows={1}
              wrap="soft"
              maxLength={200}
              aria-label={titleLabel}
              onChange={(event) => setTitleDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                const title = titleDraft.trim();
                if (title) {
                  setTitleDraft(title);
                  if (title !== task.title) onTaskChange(task.id, { title });
                } else {
                  setTitleDraft(task.title);
                }
              }}
            />
          </header>
          <TaskContent
            editor={editor}
            taskId={task.id}
            onTaskChange={onTaskChange}
            mediaStorage={mediaStorage}
          />
        </div>
        <div
          className={styles.taskDetailsScrollbar}
          ref={scrollbarRef}
          role="scrollbar"
          aria-label={task.title}
          aria-controls={panelId}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={0}
          aria-valuenow={0}
          tabIndex={0}
          onPointerDown={handleScrollbarTrackPointerDown}
          onKeyDown={handleScrollbarKeyDown}
        >
          <div
            className={styles.taskDetailsScrollbarThumb}
            onPointerDown={handleScrollbarThumbPointerDown}
            onPointerMove={handleScrollbarThumbPointerMove}
            onPointerUp={handleScrollbarThumbPointerUp}
            onPointerCancel={handleScrollbarThumbPointerUp}
          />
        </div>
      </aside>
      {createPortal(
        <div
          className={styles.taskDetailsResizeHandle}
          ref={resizeHandleRef}
          role="separator"
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuenow={width ?? DEFAULT_PANEL_WIDTH}
          aria-valuemax={Math.round(maximumPanelWidth.current)}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0 || !panelRef.current) return;

            event.preventDefault();
            titleInputRef.current?.blur();

            const panelWidth = panelRef.current.getBoundingClientRect().width;
            resizeStart.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              width: panelWidth,
              currentWidth: panelWidth,
            };
            resizeWorkspace.current =
              panelRef.current.closest<HTMLElement>("[data-workspace]") ?? null;
            resizeWorkspace.current?.toggleAttribute("data-task-details-resizing", true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = resizeStart.current;
            if (!start || start.pointerId !== event.pointerId || !panelRef.current) return;

            const nextWidth = Math.min(
              maximumPanelWidth.current,
              Math.max(MIN_PANEL_WIDTH, start.width - (event.clientX - start.x)),
            );
            start.currentWidth = nextWidth;

            const handle = event.currentTarget;
            if (resizeFrame.current === null) {
              resizeFrame.current = window.requestAnimationFrame(() => {
                resizeFrame.current = null;
                const panelWidth = start.currentWidth;
                panelRef.current
                  ?.closest<HTMLElement>("[data-workspace]")
                  ?.style.setProperty("--task-details-width", `${panelWidth}px`);
                handle.setAttribute("aria-valuenow", String(Math.round(panelWidth)));
                handle.setAttribute("aria-valuemax", String(Math.round(maximumPanelWidth.current)));
              });
            }
          }}
          onPointerUp={(event) => {
            const start = resizeStart.current;
            if (!start || start.pointerId !== event.pointerId) return;

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finishResize();
            resizeStart.current = null;
            resizePanel(start.currentWidth);
          }}
          onPointerCancel={(event) => {
            const start = resizeStart.current;
            if (!start || start.pointerId !== event.pointerId || !panelRef.current) return;

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            finishResize();
            panelRef.current
              .closest<HTMLElement>("[data-workspace]")
              ?.style.setProperty("--task-details-width", `${start.width}px`);
            event.currentTarget.setAttribute("aria-valuenow", String(Math.round(start.width)));
            resizeStart.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

            event.preventDefault();
            const panelWidth = panelRef.current?.getBoundingClientRect().width ?? 0;
            const step = event.shiftKey ? 48 : 16;
            resizePanel(panelWidth + (event.key === "ArrowLeft" ? step : -step));
          }}
        >
          <FiMoreVertical className={styles.taskDetailsResizeIcon} aria-hidden="true" />
        </div>,
        resizeTarget,
      )}
    </>
  );
}

export default memo(
  TaskDetails,
  (previous, next) =>
    previous.task.id === next.task.id &&
    previous.task.title === next.task.title &&
    previous.titleLabel === next.titleLabel &&
    previous.closeLabel === next.closeLabel &&
    previous.toggleWidthLabel === next.toggleWidthLabel &&
    previous.resizeLabel === next.resizeLabel &&
    previous.width === next.width &&
    previous.resizeTarget === next.resizeTarget &&
    previous.onClose === next.onClose &&
    previous.onResize === next.onResize &&
    previous.onTaskChange === next.onTaskChange,
);
