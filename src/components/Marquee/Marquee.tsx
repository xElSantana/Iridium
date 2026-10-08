import { memo } from "react";
import styles from "./Marquee.module.css";

interface MarqueeProps {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default memo(function Marquee({ left, top, width, height }: MarqueeProps) {
  return (
    <div
      className={styles.marquee}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
});
