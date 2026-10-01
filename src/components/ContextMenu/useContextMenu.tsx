import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

interface Position {
  x: number;
  y: number;
}

interface ContextMenuOptions<T> {
  label: string;
  disabled?: boolean;
  onSelect: (target: T) => void;
}

export function useContextMenu<T>({ label, disabled = false, onSelect }: ContextMenuOptions<T>) {
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

  const onContextMenu = (event: MouseEvent<HTMLElement>, target: T) => {
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
        y: Math.max(8, Math.min(y, window.innerHeight - 48)),
      },
    });
  };

  const contextMenu =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.menu}
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{ left: menu.position.x, top: menu.position.y }}
          >
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(menu.target);
                setMenu(null);
              }}
            >
              {label}
            </button>
          </div>,
          document.body,
        )
      : null;

  return { contextMenu, onContextMenu };
}
