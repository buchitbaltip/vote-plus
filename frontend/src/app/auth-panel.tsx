"use client";

import { FormEvent, useState } from "react";
import { HttpError, login, register } from "@/lib/api";
import type { AuthResponse, AuthUser } from "@/lib/types";
import styles from "./page.module.css";

type Mode = "login" | "register";

interface Props {
  user: AuthUser | null;
  onAuth: (res: AuthResponse) => void;
  onLogout: () => void;
}

export default function AuthPanel({ user, onAuth, onLogout }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await login(username, password)
          : await register(username, password);
      onAuth(res);
      setPassword("");
    } catch (err) {
      if (err instanceof HttpError) {
        // 409 = username taken, 401 = wrong credentials, 400 = validation
        setError(err.message);
      } else {
        setError("เชื่อมต่อ server ไม่ได้ ตรวจสอบว่า backend รันอยู่ที่ port 3001");
      }
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <section className={styles.card}>
        <div className={styles.authRow}>
          <span className={styles.userChip}>
            <span className={styles.avatar}>
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span>
              เข้าสู่ระบบเป็น <strong>{user.username}</strong>
            </span>
          </span>
          <button className={styles.btn} onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          {mode === "login" ? "เข้าสู่ระบบเพื่อโหวต" : "สมัครบัญชีใหม่"}
        </h2>
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={mode === "login"}
            className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Login
          </button>
          <button
            role="tab"
            aria-selected={mode === "register"}
            className={`${styles.tab} ${mode === "register" ? styles.tabActive : ""}`}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Register
          </button>
        </div>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={mode === "register" ? 3 : 1}
          maxLength={32}
        />
        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "register" ? 6 : 1}
        />
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          type="submit"
          disabled={busy}
        >
          {busy ? "กำลังส่ง…" : mode === "login" ? "เข้าสู่ระบบ" : "สมัคร"}
        </button>
      </form>

      {mode === "register" && (
        <p className={styles.hint} style={{ marginTop: 10 }}>
          Username 3–32 ตัว (a-z, 0-9, _ .) และต้องไม่ซ้ำกับคนอื่น · รหัสผ่านอย่างน้อย 6 ตัว
        </p>
      )}
      {error && (
        <div
          className={`${styles.alert} ${styles.alertError}`}
          style={{ marginTop: 10 }}
        >
          {error}
        </div>
      )}
    </section>
  );
}
