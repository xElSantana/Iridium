import "@blocknote/mantine/style.css";
import { es } from "@blocknote/core/locales";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { createPortal } from "react-dom";
import { memo, useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { FiChevronsRight, FiMoreVertical } from "react-icons/fi";
import type { Task } from "../../features/tasks/taskStorage";
import styles from "./TaskDetails.module.css";

const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH = 1200;
const DEFAULT_PANEL_WIDTH = 400;
const MIN_SCROLLBAR_THUMB_SIZE = 24;
const SCROLLBAR_ACTIVE_TIMEOUT = 900;

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
  resizeLabel: string;
  width: number | null;
  resizeTarget: HTMLElement;
  onClose: () => void;
  onResize: (width: number) => void;
  onTaskChange: (taskId: string, changes: Partial<Pick<Task, "title" | "content">>) => void;
}

const TaskContent = memo(function TaskContent({
  editor,
  taskId,
  onTaskChange,
}: {
  editor: ComponentProps<typeof BlockNoteView>["editor"];
  taskId: string;
  onTaskChange: TaskDetailsProps["onTaskChange"];
}) {
  return (
    <BlockNoteView
      className={styles.editor}
      editor={editor}
      theme={blockNoteTheme}
      onChange={() => onTaskChange(taskId, { content: editor.document })}
    />
  );
});

function TaskDetails({
  task,
  titleLabel,
  closeLabel,
  resizeLabel,
  width,
  resizeTarget,
  onClose,
  onResize,
  onTaskChange,
}: TaskDetailsProps) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [maximumPanelWidth, setMaximumPanelWidth] = useState(MAX_PANEL_WIDTH);
  const panelRef = useRef<HTMLElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();
  const scrollbarDrag = useRef<{ pointerId: number; y: number; thumbTop: number } | null>(null);
  const scrollbarActiveTimer = useRef<number | null>(null);
  const resizeStart = useRef<{
    pointerId: number;
    x: number;
    width: number;
    currentWidth: number;
  } | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const resizeWorkspace = useRef<HTMLElement | null>(null);
  const editor = useCreateBlockNote(
    { initialContent: task.content?.length ? task.content : undefined, dictionary: es },
    [task.id],
  );

  useEffect(() => setTitleDraft(task.title), [task.title]);

  useEffect(() => {
    const titleInput = titleInputRef.current;
    if (!titleInput) return;

    titleInput.style.height = "auto";
    titleInput.style.height = `${titleInput.scrollHeight}px`;
  }, [titleDraft]);

  useEffect(() => {
    const panel = panelRef.current;
    const scrollContent = scrollContentRef.current;
    const scrollbar = scrollbarRef.current;
    if (!panel || !scrollContent || !scrollbar) return;

    const updateScrollbar = () => {
      const trackHeight = scrollbar.clientHeight;
      const maxScroll = scrollContent.scrollHeight - scrollContent.clientHeight;
      const thumbHeight =
        maxScroll > 0
          ? Math.min(
              trackHeight,
              Math.max(
                MIN_SCROLLBAR_THUMB_SIZE,
                (scrollContent.clientHeight / scrollContent.scrollHeight) * trackHeight,
              ),
            )
          : 0;
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const thumbTop = maxScroll > 0 ? (scrollContent.scrollTop / maxScroll) * maxThumbTop : 0;

      panel.toggleAttribute("data-task-details-scrollbar-hidden", maxScroll <= 0);
      scrollbar.style.setProperty("--scrollbar-thumb-height", `${thumbHeight}px`);
      scrollbar.style.setProperty("--scrollbar-thumb-top", `${thumbTop}px`);
      scrollbar.setAttribute("aria-valuemax", String(Math.round(maxScroll)));
      scrollbar.setAttribute("aria-valuenow", String(Math.round(scrollContent.scrollTop)));
    };

    const activateScrollbar = () => {
      panel.setAttribute("data-task-details-scrollbar-active", "");
      if (scrollbarActiveTimer.current !== null) {
        window.clearTimeout(scrollbarActiveTimer.current);
      }
      scrollbarActiveTimer.current = window.setTimeout(() => {
        panel.removeAttribute("data-task-details-scrollbar-active");
        scrollbarActiveTimer.current = null;
      }, SCROLLBAR_ACTIVE_TIMEOUT);
    };

    const onScroll = () => {
      activateScrollbar();
      updateScrollbar();
    };

    scrollContent.addEventListener("scroll", onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(panel);
    resizeObserver.observe(scrollContent);
    if (titleInputRef.current) resizeObserver.observe(titleInputRef.current);
    const editorContent = scrollContent.querySelector<HTMLElement>(".bn-editor");
    if (editorContent) resizeObserver.observe(editorContent);
    const mutationObserver = new MutationObserver(updateScrollbar);
    mutationObserver.observe(scrollContent, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    updateScrollbar();

    return () => {
      scrollContent.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (scrollbarActiveTimer.current !== null) {
        window.clearTimeout(scrollbarActiveTimer.current);
        scrollbarActiveTimer.current = null;
      }
    };
  }, []);

  const finishResize = () => {
    if (resizeFrame.current !== null) {
      window.cancelAnimationFrame(resizeFrame.current);
      resizeFrame.current = null;
    }
    resizeWorkspace.current?.removeAttribute("data-task-details-resizing");
  };

  useEffect(() => finishResize, []);

  useEffect(() => {
    const updateBounds = () => {
      const maxWidth = getMaximumPanelWidth(panelRef.current);
      setMaximumPanelWidth(maxWidth);

      const panelWidth = panelRef.current?.getBoundingClientRect().width;
      if (panelWidth !== undefined && panelWidth > maxWidth) {
        onResize(maxWidth);
      }
    };

    updateBounds();
    const workspace = panelRef.current?.closest<HTMLElement>("[data-workspace]");
    const sidebar = workspace?.querySelector<HTMLElement>("#workspace-sidebar");
    const resizeObserver = new ResizeObserver(updateBounds);
    if (workspace) resizeObserver.observe(workspace);
    if (sidebar) resizeObserver.observe(sidebar);
    return () => {
      resizeObserver.disconnect();
    };
  }, [onResize]);

  const resizePanel = (nextWidth: number) => {
    onResize(Math.min(Math.max(nextWidth, MIN_PANEL_WIDTH), maximumPanelWidth));
  };

  return (
    <>
      <aside
        className={styles.taskDetails}
        data-task-details
        ref={panelRef}
        aria-label={task.title}
        style={{ width: width ?? DEFAULT_PANEL_WIDTH }}
      >
        <div className={styles.taskDetailsContent} ref={scrollContentRef} id={panelId}>
          <header className={styles.taskDetailsHeader}>
            <button
              className={styles.closeButton}
              type="button"
              aria-label={closeLabel}
              title={closeLabel}
              onClick={onClose}
            >
              <FiChevronsRight aria-hidden="true" />
            </button>
            <textarea
              className={styles.taskTitleInput}
              ref={titleInputRef}
              value={titleDraft}
              rows={1}
              wrap="soft"
              maxLength={200}
              aria-label={titleLabel}
              onChange={(event) => setTitleDraft(event.currentTarget.value)}
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
          <TaskContent editor={editor} taskId={task.id} onTaskChange={onTaskChange} />
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
          onPointerDown={(event) => {
            if (event.button !== 0 || event.target !== event.currentTarget) return;

            const scrollContent = scrollContentRef.current;
            const scrollbar = scrollbarRef.current;
            if (!scrollContent || !scrollbar) return;

            const trackHeight = scrollbar.clientHeight;
            const thumbHeight = Number.parseFloat(
              scrollbar.style.getPropertyValue("--scrollbar-thumb-height"),
            );
            const maxScroll = scrollContent.scrollHeight - scrollContent.clientHeight;
            const maxThumbTop = trackHeight - thumbHeight;
            if (maxScroll <= 0 || maxThumbTop <= 0) return;

            const pointerTop =
              event.clientY - scrollbar.getBoundingClientRect().top - thumbHeight / 2;
            scrollContent.scrollTop =
              (Math.min(Math.max(pointerTop, 0), maxThumbTop) / maxThumbTop) * maxScroll;
          }}
          onKeyDown={(event) => {
            const scrollContent = scrollContentRef.current;
            if (!scrollContent) return;

            const pageStep = scrollContent.clientHeight * 0.8;
            const steps: Record<string, number> = {
              ArrowDown: 40,
              ArrowUp: -40,
              PageDown: pageStep,
              PageUp: -pageStep,
              End: scrollContent.scrollHeight,
              Home: -scrollContent.scrollHeight,
            };
            const step = steps[event.key];
            if (step === undefined) return;

            event.preventDefault();
            scrollContent.scrollTop =
              event.key === "End"
                ? scrollContent.scrollHeight
                : event.key === "Home"
                  ? 0
                  : scrollContent.scrollTop + step;
          }}
        >
          <div
            className={styles.taskDetailsScrollbarThumb}
            onPointerDown={(event) => {
              if (event.button !== 0) return;

              const scrollbar = scrollbarRef.current;
              if (!scrollbar || !scrollContentRef.current) return;

              event.preventDefault();
              const thumbTop = Number.parseFloat(
                scrollbar.style.getPropertyValue("--scrollbar-thumb-top"),
              );
              scrollbarDrag.current = { pointerId: event.pointerId, y: event.clientY, thumbTop };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = scrollbarDrag.current;
              const scrollbar = scrollbarRef.current;
              const scrollContent = scrollContentRef.current;
              if (
                !drag ||
                drag.pointerId !== event.pointerId ||
                !scrollbar ||
                !scrollContent ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              ) {
                return;
              }

              event.preventDefault();
              const thumbHeight = Number.parseFloat(
                scrollbar.style.getPropertyValue("--scrollbar-thumb-height"),
              );
              const maxThumbTop = scrollbar.clientHeight - thumbHeight;
              const maxScroll = scrollContent.scrollHeight - scrollContent.clientHeight;
              if (maxThumbTop <= 0 || maxScroll <= 0) return;

              const nextThumbTop = Math.min(
                Math.max(drag.thumbTop + event.clientY - drag.y, 0),
                maxThumbTop,
              );
              scrollContent.scrollTop = (nextThumbTop / maxThumbTop) * maxScroll;
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              scrollbarDrag.current = null;
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              scrollbarDrag.current = null;
            }}
          />
        </div>
      </aside>
      {createPortal(
        <div
          className={styles.taskDetailsResizeHandle}
          role="separator"
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuenow={width ?? DEFAULT_PANEL_WIDTH}
          aria-valuemax={Math.round(maximumPanelWidth)}
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
              maximumPanelWidth,
              Math.max(MIN_PANEL_WIDTH, start.width - (event.clientX - start.x)),
            );
            start.currentWidth = nextWidth;

            const handle = event.currentTarget;
            if (resizeFrame.current === null) {
              resizeFrame.current = window.requestAnimationFrame(() => {
                resizeFrame.current = null;
                const panelWidth = start.currentWidth;
                if (panelRef.current) {
                  panelRef.current.style.width = `${panelWidth}px`;
                }
                handle.setAttribute("aria-valuenow", String(Math.round(panelWidth)));
                handle.setAttribute("aria-valuemax", String(Math.round(maximumPanelWidth)));
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
            panelRef.current.style.width = `${start.width}px`;
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
    previous.resizeLabel === next.resizeLabel &&
    previous.width === next.width &&
    previous.resizeTarget === next.resizeTarget &&
    previous.onClose === next.onClose &&
    previous.onResize === next.onResize &&
    previous.onTaskChange === next.onTaskChange,
);
