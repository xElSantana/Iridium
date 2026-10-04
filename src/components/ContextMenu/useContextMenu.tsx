import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import styles from "./ContextMenu.module.css";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuOptions<T> {
  actionsLabel: string;
  editLabel: string;
  label: string;
  disabled?: boolean;
  onEdit: (target: T) => void;
  onSelect: (target: T) => void;
}

export function useContextMenu<T>({
  actionsLabel,
  editLabel,
  label,
  disabled = false,
  onEdit,
  onSelect,
}: ContextMenuOptions<T>) {
  const [menu, setMenu] = useState<{ position: Position; target: T } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!menu) return;

    const closeMenu = () => setMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMenu();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    menuRef.current?.querySelector("button")?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menu]);

  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, target: T) => {
      if (disabled) return;

      event.preventDefault();
      triggerRef.current = event.currentTarget;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX || bounds.left;
      const y = event.clientY || bounds.bottom;

      setMenu({
        target,
        position: {
          x: Math.max(8, Math.min(x, window.innerWidth - 160)),
          y: Math.max(8, Math.min(y, window.innerHeight - 72)),
        },
      });
    },
    [disabled],
  );

  const contextMenu =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.menu}
            ref={menuRef}
            role="menu"
            aria-label={actionsLabel}
            style={{ left: menu.position.x, top: menu.position.y }}
          >
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              onClick={() => {
                onEdit(menu.target);
                setMenu(null);
              }}
            >
              <LuPencil className={styles.menuItemIcon} aria-hidden="true" />
              {editLabel}
            </button>
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(menu.target);
                setMenu(null);
              }}
            >
              <LuTrash2 className={styles.menuItemIcon} aria-hidden="true" />
              {label}
            </button>
          </div>,
          document.body,
        )
      : null;

  return { contextMenu, onContextMenu };
}
