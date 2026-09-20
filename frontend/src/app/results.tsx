"use client";

import { useState } from "react";
import { readOnChain, type OnChainSnapshot } from "@/lib/chain";
import type { ResultsPayload } from "@/lib/types";
import StatusBadge, { shortHash } from "./status-badge";
import styles from "./page.module.css";

interface Props {
  results: ResultsPayload | null;
  live: boolean;
}

export default function Results({ results, live }: Props) {
  const [snapshot, setSnapshot] = useState<OnChainSnapshot | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  if (!results) {
    return (
      <section className={styles.card}>
        <p className={styles.empty}>กำลังโหลดผลคะแนน…</p>
      </section>
    );
  }

  const { candidates, chain, ledger } = results;
  const max = Math.max(1, ...candidates.map((c) => c.dbVotes));
  const leaderId =
    results.totalDbVotes > 0
      ? candidates.reduce((a, b) => (b.dbVotes > a.dbVotes ? b : a)).id
      : null;

  async function verify() {
    if (!chain.contractAddress) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      setSnapshot(await readOnChain(chain.contractAddress));
    } catch (err) {
      setVerifyError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      {/* ---------- live tally ---------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>ผลคะแนนแบบ Real-time</h2>
          <span
            className={`${styles.badge} ${live ? styles.badgeSuccess : styles.badgeWarning}`}
          >
            <span className={`${styles.dot} ${live ? styles.dotLive : ""}`} />
            {live ? "LIVE · SSE connected" : "reconnecting…"}
          </span>
        </div>

        {candidates.map((c) => {
          const pct = results.totalDbVotes
            ? Math.round((c.dbVotes / results.totalDbVotes) * 100)
            : 0;
          const mismatch =
            c.chainVotes !== null && c.chainVotes !== c.dbVotes;
          return (
            <div
              key={c.id}
              className={`${styles.resultRow} ${c.id === leaderId ? styles.resultLeader : ""}`}
            >
              <span className={styles.resultNumber}>{c.number}</span>
              <div>
                <div className={styles.resultName}>
                  <span>{c.name}</span>
                  <span className={styles.hint}>{pct}%</span>
                </div>
                <div className={styles.bar}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${(c.dbVotes / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className={styles.resultCounts}>
                <div className={styles.count}>{c.dbVotes}</div>
                {c.chainVotes !== null && (
                  <div
                    className={`${styles.countChain} ${mismatch ? styles.countMismatch : ""}`}
                    title="อ่านจาก smart contract ผ่าน backend"
                  >
                    ⛓ {c.chainVotes}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className={styles.totals}>
          <span>
            รวมใน PostgreSQL: <strong>{results.totalDbVotes}</strong>
          </span>
          {results.totalChainVotes !== null && (
            <span>
              รวมบน chain: <strong>{results.totalChainVotes}</strong>
              {results.totalChainVotes !== results.totalDbVotes && (
                <em> (ต่างกัน = มีโหวตที่ยังรอ mine)</em>
              )}
            </span>
          )}
          <span>
            อัปเดต {new Date(results.generatedAt).toLocaleTimeString("th-TH")}
          </span>
        </div>
      </section>

      {/* ---------- chain / verify ---------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>ความโปร่งใส · Smart Contract</h2>
          <span
            className={`${styles.badge} ${chain.enabled ? styles.badgeChain : styles.badgeWarning}`}
          >
            {chain.enabled
              ? `${chain.networkName ?? "sepolia"} · chainId ${chain.chainId}`
              : "OFF-CHAIN mode"}
          </span>
        </div>

        {chain.enabled && chain.contractAddress ? (
          <>
            <dl className={styles.kv}>
              <dt>Contract</dt>
              <dd>
                <a
                  className={styles.hash}
                  href={`${chain.explorerUrl}/address/${chain.contractAddress}#code`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {chain.contractAddress} ↗
                </a>
              </dd>
              <dt>Backend wallet</dt>
              <dd>
                <a
                  className={styles.hash}
                  href={`${chain.explorerUrl}/address/${chain.backendWallet}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {chain.backendWallet} ↗
                </a>
              </dd>
            </dl>
            {chain.error && (
              <div
                className={`${styles.alert} ${styles.alertWarn}`}
                style={{ marginTop: 10 }}
              >
                backend อ่าน chain ไม่ได้: {chain.error}
              </div>
            )}

            <div className={styles.verifyBox}>
              <div className={styles.cardHead} style={{ marginBottom: 0 }}>
                <div>
                  <strong>ตรวจสอบเองจาก browser</strong>
                  <p className={styles.hint}>
                    เรียก <code>getVotes()</code> ผ่าน public RPC ตรงจาก
                    browser ของคุณ — ไม่ผ่าน backend เลย
                  </p>
                </div>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={verify}
                  disabled={verifying}
                >
                  {verifying ? "กำลังอ่าน chain…" : "อ่านจาก chain"}
                </button>
              </div>

              {verifyError && (
                <div
                  className={`${styles.alert} ${styles.alertError}`}
                  style={{ marginTop: 10 }}
                >
                  {verifyError}
                </div>
              )}

              {snapshot && (
                <>
                  <div className={styles.verifyGrid}>
                    {snapshot.votes.map((v, i) => (
                      <div key={i} className={styles.verifyCell}>
                        <small>เบอร์ {i + 1}</small>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                  <dl className={styles.kv}>
                    <dt>totalVotes()</dt>
                    <dd>{snapshot.totalVotes}</dd>
                    <dt>owner()</dt>
                    <dd className={styles.hash}>
                      {snapshot.owner}
                      {chain.backendWallet &&
                      snapshot.owner.toLowerCase() ===
                        chain.backendWallet.toLowerCase()
                        ? " ✓ ตรงกับ backend wallet"
                        : ""}
                    </dd>
                    <dt>block</dt>
                    <dd>
                      #{snapshot.blockNumber} ·{" "}
                      {new Date(snapshot.fetchedAt).toLocaleTimeString("th-TH")}
                    </dd>
                    <dt>RPC</dt>
                    <dd className={styles.hash}>{snapshot.rpcUrl}</dd>
                  </dl>
                </>
              )}
            </div>
          </>
        ) : (
          <p className={styles.hint}>
            Backend ยังไม่ได้ตั้งค่า <code>RPC_URL</code>,{" "}
            <code>BACKEND_WALLET_PRIVATE_KEY</code>,{" "}
            <code>VOTING_CONTRACT_ADDRESS</code> — คะแนนถูกเก็บใน PostgreSQL
            อย่างเดียว ดูวิธีตั้งค่าใน README
          </p>
        )}
      </section>

      {/* ---------- ledger ---------- */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>บันทึกการโหวตล่าสุด</h2>
          <p className={styles.hint}>ไม่แสดงตัวตนผู้โหวต · {ledger.length} รายการ</p>
        </div>
        {ledger.length === 0 ? (
          <p className={styles.empty}>ยังไม่มีใครโหวต — เป็นคนแรกสิ</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>เบอร์</th>
                  <th>สถานะ</th>
                  <th>Transaction</th>
                  <th>Block</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((v) => (
                  <tr key={v.id}>
                    <td>{new Date(v.createdAt).toLocaleTimeString("th-TH")}</td>
                    <td>
                      <strong>#{v.candidateNumber}</strong> {v.candidateName}
                    </td>
                    <td>
                      <StatusBadge status={v.status} />
                    </td>
                    <td>
                      {v.txHash ? (
                        <a
                          className={styles.hash}
                          href={`${chain.explorerUrl}/tx/${v.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          title={v.txHash}
                        >
                          {shortHash(v.txHash)} ↗
                        </a>
                      ) : (
                        <span className={styles.hint}>—</span>
                      )}
                    </td>
                    <td>{v.blockNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
