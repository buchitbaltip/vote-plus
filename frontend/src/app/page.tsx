"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCandidates,
  getMyVote,
  getToken,
  me,
  RESULTS_STREAM_URL,
  setToken,
} from "@/lib/api";
import type {
  AuthResponse,
  AuthUser,
  Candidate,
  MyVote,
  ResultsPayload,
} from "@/lib/types";
import AuthPanel from "./auth-panel";
import Ballot from "./ballot";
import Results from "./results";
import styles from "./page.module.css";

/**
 * The whole app is this one page:
 *   1. Auth (login / register)          -> JWT in localStorage
 *   2. Ballot (5 candidates, 1 vote)    -> POST /votes
 *   3. Live results + on-chain proof    -> SSE /votes/stream
 */
export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [live, setLive] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // --- restore session + load ballot ---
  useEffect(() => {
    getCandidates()
      .then(setCandidates)
      .catch(() =>
        setBootError(
          "โหลดรายชื่อผู้สมัครไม่ได้ — backend รันอยู่ที่ port 3001 หรือยัง?",
        ),
      );

    if (getToken()) {
      me()
        .then(async (u) => {
          setUser(u);
          setMyVote(await getMyVote());
        })
        .catch(() => setToken(null)); // expired / invalid token
    }
  }, []);

  // --- real-time results over Server-Sent Events ---
  useEffect(() => {
    const es = new EventSource(RESULTS_STREAM_URL);
    es.onopen = () => setLive(true);
    es.onmessage = (ev) => setResults(JSON.parse(ev.data) as ResultsPayload);
    es.onerror = () => setLive(false); // EventSource auto-reconnects
    return () => es.close();
  }, []);

  // While my vote is PENDING, the live ledger carries its confirmation —
  // overlay the newest status without another request.
  const liveVote = useMemo(() => {
    if (!myVote || myVote.status !== "PENDING" || !results) return myVote;
    const entry = results.ledger.find((l) => l.id === myVote.id);
    return entry
      ? { ...myVote, status: entry.status, blockNumber: entry.blockNumber }
      : myVote;
  }, [myVote, results]);

  const handleAuth = useCallback(async (res: AuthResponse) => {
    setToken(res.accessToken);
    setUser(res.user);
    setMyVote(await getMyVote().catch(() => null));
  }, []);

  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    setMyVote(null);
  }, []);

  const chain = results?.chain;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Vote Plus</h1>
          <p className={styles.subtitle}>
            เลือกตั้งประธานนักเรียน · Next.js + NestJS + PostgreSQL + Ethereum
            (Sepolia)
          </p>
        </div>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${live ? styles.badgeSuccess : ""}`}>
            <span className={`${styles.dot} ${live ? styles.dotLive : ""}`} />
            {live ? "live" : "offline"}
          </span>
          {chain && (
            <span
              className={`${styles.badge} ${chain.enabled ? styles.badgeChain : styles.badgeWarning}`}
            >
              ⛓ {chain.enabled ? "on-chain" : "off-chain"}
            </span>
          )}
        </div>
      </header>

      {bootError && (
        <div className={`${styles.alert} ${styles.alertError}`}>{bootError}</div>
      )}

      <AuthPanel user={user} onAuth={handleAuth} onLogout={handleLogout} />

      <div className={styles.grid2}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Ballot
            user={user}
            candidates={candidates}
            myVote={liveVote}
            explorerUrl={chain?.explorerUrl ?? "https://sepolia.etherscan.io"}
            onVoted={setMyVote}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Results results={results} live={live} />
        </div>
      </div>

      <footer className={styles.footer}>
        คะแนนใน PostgreSQL คือ source of truth สำหรับ &quot;ใครโหวตแล้ว&quot; ·
        คะแนนบน smart contract คือหลักฐานสาธารณะที่แก้ไขไม่ได้
      </footer>
    </main>
  );
}
