import type { VoteStatus } from "@/lib/types";
import styles from "./page.module.css";

const LABEL: Record<VoteStatus, string> = {
  PENDING: "รอยืนยันบน chain",
  CONFIRMED: "ยืนยันบน chain แล้ว",
  FAILED: "ส่งขึ้น chain ไม่สำเร็จ",
  OFF_CHAIN: "บันทึกใน DB เท่านั้น",
};

const CLASS: Record<VoteStatus, string> = {
  PENDING: styles.badgeWarning,
  CONFIRMED: styles.badgeSuccess,
  FAILED: styles.badgeDanger,
  OFF_CHAIN: "",
};

export default function StatusBadge({ status }: { status: VoteStatus }) {
  return (
    <span className={`${styles.badge} ${CLASS[status]}`}>
      <span
        className={`${styles.dot} ${status === "PENDING" ? styles.dotLive : ""}`}
      />
      {LABEL[status]}
    </span>
  );
}

export function shortHash(hash: string, chars = 6) {
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}
