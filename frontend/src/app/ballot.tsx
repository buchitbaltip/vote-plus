"use client";

import { useState } from "react";
import { HttpError, castVote } from "@/lib/api";
import type { AuthUser, Candidate, MyVote } from "@/lib/types";
import StatusBadge, { shortHash } from "./status-badge";
import styles from "./page.module.css";

interface Props {
  user: AuthUser | null;
  candidates: Candidate[];
  myVote: MyVote | null;
  explorerUrl: string;
  onVoted: (vote: MyVote) => void;
}

export default function Ballot({
  user,
  candidates,
  myVote,
  explorerUrl,
  onVoted,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = !user || !!myVote;

  async function confirm() {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    try {
      onVoted(await castVote(selected));
      setSelected(null);
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message); // 409 already voted, 502 chain error, ...
      } else {
        setError("เชื่อมต่อ server ไม่ได้");
      }
    } finally {
      setBusy(false);
    }
  }

  const chosen = candidates.find((c) => c.id === selected);

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>บัตรเลือกตั้งประธานนักเรียน</h2>
        <p className={styles.hint}>เลือกได้ 1 เบอร์ · โหวตได้ครั้งเดียว</p>
      </div>

      <div className={styles.candidateList}>
        {candidates.map((c) => {
          const isVoted = myVote?.candidateId === c.id;
          const isSelected = selected === c.id && !myVote;
          return (
            <button
              key={c.id}
              type="button"
              disabled={locked || busy}
              onClick={() => setSelected(c.id)}
              className={[
                styles.candidate,
                isSelected ? styles.candidateSelected : "",
                isVoted ? styles.candidateVoted : "",
              ].join(" ")}
              aria-pressed={isSelected}
            >
              <span className={styles.number}>{c.number}</span>
              <span className={styles.candidateBody}>
                <p className={styles.candidateName}>{c.name}</p>
                <p className={styles.candidateMeta}>
                  {c.classroom} · {c.slogan}
                </p>
              </span>
              {(isSelected || isVoted) && (
                <span className={styles.check}>{isVoted ? "✅" : "☑️"}</span>
              )}
            </button>
          );
        })}
      </div>

      {myVote ? (
        <div className={styles.voted}>
          <p>
            คุณโหวตให้ <strong>เบอร์ {myVote.candidateNumber}</strong>{" "}
            {myVote.candidateName} แล้ว — ขอบคุณที่ใช้สิทธิ์
          </p>
          <div className={styles.txLine}>
            <StatusBadge status={myVote.status} />
            {myVote.txHash && (
              <>
                <span>Tx:</span>
                <a
                  className={styles.hash}
                  href={`${explorerUrl}/tx/${myVote.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={myVote.txHash}
                >
                  {shortHash(myVote.txHash, 8)} ↗
                </a>
              </>
            )}
            {myVote.blockNumber && <span>block #{myVote.blockNumber}</span>}
          </div>
        </div>
      ) : (
        <div className={styles.ballotFooter}>
          {!user ? (
            <div className={`${styles.alert} ${styles.alertInfo}`}>
              เข้าสู่ระบบด้านบนก่อนจึงจะโหวตได้
            </div>
          ) : chosen ? (
            <p style={{ margin: 0 }}>
              เลือก <strong>เบอร์ {chosen.number}</strong> {chosen.name} —
              กดยืนยันเพื่อส่งคะแนน (แก้ไขไม่ได้หลังยืนยัน)
            </p>
          ) : (
            <p className={styles.hint}>แตะที่ผู้สมัครเพื่อเลือก</p>
          )}
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}
            disabled={!user || selected === null || busy}
            onClick={confirm}
          >
            {busy ? "กำลังส่งคะแนน…" : "ยืนยันการโหวต"}
          </button>
        </div>
      )}

      {error && (
        <div
          className={`${styles.alert} ${styles.alertError}`}
          style={{ marginTop: 12 }}
        >
          {error}
        </div>
      )}
    </section>
  );
}
