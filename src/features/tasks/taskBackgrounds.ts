export const TASK_BACKGROUNDS = [
  { id: "meadow-day", src: "/resources/backgrounds/meadow-day.png" },
  { id: "meadow-night", src: "/resources/backgrounds/meadow-night.png" },
] as const;

export type TaskBackgroundId = (typeof TASK_BACKGROUNDS)[number]["id"];

export function isTaskBackgroundId(value: unknown): value is TaskBackgroundId {
  return TASK_BACKGROUNDS.some((background) => background.id === value);
}
