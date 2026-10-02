import "@blocknote/mantine/style.css";
import { es } from "@blocknote/core/locales";
import { BlockNoteView, type Theme } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { FiMoreVertical, FiX } from "react-icons/fi";
import type { Task } from "../../features/tasks/taskStorage";
import styles from "./TaskDetails.module.css";

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
  fontFamily: '"Comic Relief", system-ui',
} satisfies Theme;

const getMaximumPanelWidth = (panel: HTMLElement | null) => {
  const workspace = panel?.closest<HTMLElement>("[data-workspace]");
  const sidebar = workspace?.querySelector<HTMLElement>("#workspace-sidebar");
  const workspaceResizeHandle = workspace?.querySelector<HTMLElement>("[data-resize-handle]");
  if (!workspace || !sidebar || !workspaceResizeHandle) {
    return panel?.parentElement?.clientWidth ?? 0;
  }

  return Math.max(
    0,
    workspace.clientWidth -
      6 -
      sidebar.getBoundingClientRect().width -
      workspaceResizeHandle.getBoundingClientRect().width -
      160 -
      4,
  );
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

export default function TaskDetails({
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
  const [maximumPanelWidth, setMaximumPanelWidth] = useState<number>(0);
  const panelRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
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
        if (maxWidth <= 120) {
          onClose();
        } else {
          onResize(maxWidth);
        }
      }
    };

    updateBounds();
    window.addEventListener("resize", updateBounds);
    return () => window.removeEventListener("resize", updateBounds);
  }, [onClose, onResize]);

  const resizePanel = (nextWidth: number) => {
    if (nextWidth <= 120) {
      onClose();
      return;
    }

    const containerWidth = maximumPanelWidth || getMaximumPanelWidth(panelRef.current) || nextWidth;
    onResize(Math.min(nextWidth, containerWidth));
  };

  return (
    <>
      <aside
        className={styles.taskDetails}
        data-task-details
        ref={panelRef}
        aria-label={task.title}
        style={{ width: width ?? 240 }}
      >
        <header className={styles.taskDetailsHeader}>
          <input
            className={styles.taskTitleInput}
            ref={titleInputRef}
            value={titleDraft}
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
          <button
            className={styles.closeButton}
            type="button"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>
        <BlockNoteView
          className={styles.editor}
          editor={editor}
          theme={blockNoteTheme}
          onChange={() => onTaskChange(task.id, { content: editor.document })}
        />
      </aside>
      {createPortal(
        <div
          className={styles.taskDetailsResizeHandle}
          role="separator"
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemin={120}
          aria-valuenow={width ?? 240}
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

            const containerWidth =
              maximumPanelWidth || getMaximumPanelWidth(panelRef.current) || start.width;
            const nextWidth = Math.min(
              containerWidth,
              Math.max(0, start.width - (event.clientX - start.x)),
            );
            start.currentWidth = nextWidth;

            // Coalesce a un ancho por frame: escribir style.width en cada pointermove
            // obliga al editor (BlockNote) a relayoutear por evento, causando lag.
            const handle = event.currentTarget;
            if (resizeFrame.current === null) {
              resizeFrame.current = window.requestAnimationFrame(() => {
                resizeFrame.current = null;
                const panelWidth = start.currentWidth;
                if (panelRef.current) {
                  panelRef.current.style.width = `${panelWidth}px`;
                }
                handle.setAttribute("aria-valuenow", String(Math.round(panelWidth)));
                handle.setAttribute("aria-valuemax", String(Math.round(containerWidth)));
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
