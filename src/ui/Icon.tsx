import type { CSSProperties } from "react";

export type IconName =
  | "book"
  | "arrow"
  | "back"
  | "leaf"
  | "spark"
  | "shield"
  | "bag"
  | "clock"
  | "wallet"
  | "check"
  | "lock"
  | "refresh"
  | "copy"
  | "external"
  | "flag"
  | "swap"
  | "close"
  | "chevron";
const paths: Record<IconName, string> = {
  book: "M12 5C8 2 4 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-2-1-6-2-10 1Zm0 0v15",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  leaf: "M5 20C-1 7 11 2 21 3c0 12-6 17-16 17Zm0 0L16 8",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  bag: "M8 7 6 2h12l-2 5m-8 0h8c0 4 6 7 6 12 0 4-20 4-20 0 0-5 6-8 6-12Zm0 0h8m-6 8h4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2",
  wallet:
    "M21 7H5a2 2 0 0 1 0-4h14v4M3 5v14c0 1 1 2 2 2h16V7m0 5h-6v5h6m-3-2.5h.1",
  check: "m5 12 4 4L19 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 4v3",
  refresh: "M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5m-4 7a8 8 0 0 0 14 4l3-3m0 5v-5h-5",
  copy: "M8 8h13v13H8V8Zm8-4V2H2v14h2",
  external: "M14 3h7v7m0-7L10 14m0-11H3v18h18v-7",
  flag: "M5 22V3c5-5 9 5 15 0v11c-6 5-10-5-15 0",
  swap: "M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m7 10 5 5 5-5",
};
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
    >
      <path d={paths[name]} />
    </svg>
  );
}
