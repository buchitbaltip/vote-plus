# Vote Plus — Architecture & Sequence Diagrams

ระบบเลือกตั้งประธานนักเรียนแบบ **Web 2.5**: ตัวตนผู้ใช้และกติกา "1 คน 1 เสียง" อยู่ใน PostgreSQL (Web 2) ส่วนคะแนนรวมถูกบันทึกซ้ำบน Smart Contract บน Ethereum Sepolia (Web 3) เพื่อเป็นหลักฐานสาธารณะที่แก้ไขไม่ได้

---

## 1. Architecture Diagram

```mermaid
flowchart LR
    subgraph Client["Browser"]
        FE["Next.js 16 (App Router)<br/>page.tsx · auth-panel · ballot · results"]
        LS[("localStorage<br/>JWT token")]
        FE --- LS
    end

    subgraph API["NestJS Backend :3001"]
        direction TB
        AuthM["AuthModule<br/>/auth/register · /auth/login · /auth/me<br/>bcrypt + JWT"]
        CandM["CandidatesModule<br/>GET /candidates"]
        VoteM["VotesModule<br/>POST /votes · GET /votes/me<br/>GET /votes/results · SSE /votes/stream"]
        ChainM["BlockchainModule<br/>ethers.js · NonceManager<br/>Backend Wallet (owner)"]
        Guard["JwtAuthGuard"]
        ORM["TypeORM"]

        Guard --> VoteM
        Guard --> AuthM
        VoteM --> ChainM
        AuthM --> ORM
        CandM --> ORM
        VoteM --> ORM
    end

    subgraph DB["PostgreSQL"]
        Users[("users<br/>id · username · password_hash")]
        Cands[("candidates<br/>id · number · name · slogan · classroom")]
        Votes[("votes<br/>id · user_id UNIQUE · candidate_id<br/>status · tx_hash · block_number")]
    end

    subgraph Chain["Ethereum Sepolia"]
        RPC["JSON-RPC Node"]
        SC["Voting.sol<br/>vote(candidateId) onlyOwner<br/>getVotes() view<br/>event Voted"]
        RPC --> SC
    end

    Explorer["Etherscan<br/>(sepolia.etherscan.io)"]

    FE -- "REST (JSON) + Bearer JWT" --> API
    API -- "Server-Sent Events<br/>ResultsPayload" --> FE
    ORM --> Users & Cands & Votes
    ChainM -- "sendTransaction vote(n)<br/>call getVotes()" --> RPC
    FE -. "อ่านตรงจาก contract<br/>getVotes() ผ่าน public RPC<br/>(lib/chain.ts)" .-> RPC
    FE -. "ลิงก์ดู txHash" .-> Explorer
    Explorer -.-> SC
```

**คำอธิบายสั้น ๆ**

| ชั้น | หน้าที่ |
|---|---|
| **Next.js (Frontend)** | หน้าเดียวรวม Login/Register, บัตรลงคะแนน (5 ผู้สมัคร), ผลคะแนน real-time ผ่าน SSE และปุ่มตรวจสอบคะแนนบน chain ตรงจาก browser โดยไม่ผ่าน backend |
| **NestJS (Backend)** | ตรวจตัวตน (JWT), บังคับ 1 คน 1 เสียง, เขียน PostgreSQL แล้วส่ง tx ไปยัง contract ด้วย wallet ของ backend (เป็น `owner` ของ contract) และ broadcast ผลผ่าน SSE |
| **PostgreSQL** | Source of truth ว่า "ใครโหวตแล้ว" — `votes.user_id UNIQUE` กัน double-vote แม้เกิด race |
| **Smart Contract** | นับคะแนนแบบ increment-only, มีแค่ `owner` เรียก `vote()` ได้, `getVotes()` เป็น `view` ใครก็อ่านได้ฟรี |

---

## 2. Sequence Diagram — Login / Register

```mermaid
sequenceDiagram
    autonumber
    actor S as นักเรียน
    participant FE as Next.js
    participant BE as NestJS<br/>AuthController
    participant DB as PostgreSQL

    S->>FE: กรอก username / password
    FE->>BE: POST /auth/login {username, password}
    BE->>DB: SELECT users WHERE username = ?
    DB-->>BE: user + password_hash
    BE->>BE: bcrypt.compare(password, hash)
    alt ถูกต้อง
        BE->>BE: jwt.sign({sub: userId, username})
        BE-->>FE: 200 {accessToken, user}
        FE->>FE: localStorage.setItem("vote-plus.token")
        FE->>BE: GET /votes/me (Bearer token)
        BE->>DB: SELECT votes WHERE user_id = ?
        DB-->>BE: vote | null
        BE-->>FE: 200 MyVote | null
        FE-->>S: แสดงบัตรลงคะแนน หรือสถานะโหวตแล้ว
    else ผิด
        BE-->>FE: 401 Invalid username or password
        FE-->>S: แสดงข้อความผิดพลาด
    end
```

---

## 3. Sequence Diagram — Cast Vote (หัวใจของระบบ Web 2.5)

```mermaid
sequenceDiagram
    autonumber
    actor S as นักเรียน
    participant FE as Next.js
    participant BE as NestJS<br/>VotesService
    participant DB as PostgreSQL
    participant BC as BlockchainService<br/>(ethers + Backend Wallet)
    participant RPC as Sepolia RPC
    participant SC as Voting.sol
    participant SSE as SSE Subscribers<br/>(ทุก browser)

    S->>FE: เลือกผู้สมัคร แล้วกด "ลงคะแนน"
    FE->>BE: POST /votes {candidateId}<br/>Authorization: Bearer JWT
    BE->>BE: JwtAuthGuard ตรวจ token → userId

    BE->>DB: SELECT candidates WHERE id = ?
    DB-->>BE: candidate (number, name)
    BE->>DB: SELECT votes WHERE user_id = ?
    DB-->>BE: null (ยังไม่เคยโหวต)

    BE->>DB: INSERT votes (user_id, candidate_id, status = PENDING)
    Note over DB: UNIQUE(user_id) กัน double-vote<br/>แม้ 2 request มาพร้อมกัน → 409

    BE->>BC: castVote(candidate.number)
    Note over BC: sendQueue + NonceManager<br/>เรียงลำดับ tx ไม่ให้ nonce ชนกัน
    BC->>RPC: eth_sendRawTransaction<br/>vote(candidateNumber) signed by owner wallet
    RPC-->>BC: txHash (tx เข้า mempool)
    BC-->>BE: {txHash, confirmation: Promise}

    BE->>DB: UPDATE votes SET tx_hash = ? WHERE id = ?
    BE-->>FE: 201 MyVote {status: PENDING, txHash}
    FE-->>S: แสดง "รอยืนยันบน chain" + ลิงก์ Etherscan
    BE-)SSE: broadcast(ResultsPayload) — คะแนน DB ขยับทันที

    par รอ tx ถูก mine (background)
        RPC->>SC: execute vote(candidateId)
        SC->>SC: onlyOwner ✓ · votes[id] += 1 · totalVotes += 1
        SC-->>RPC: emit Voted(candidateId, newTotal, totalVotes)
        RPC-->>BC: TransactionReceipt {status: 1, blockNumber}
        BC-->>BE: confirmation resolved
        BE->>DB: UPDATE votes SET status = CONFIRMED, block_number = ?
        BE->>BC: getVotes()
        BC->>RPC: eth_call getVotes()
        RPC-->>BC: uint256[] tally
        BE-)SSE: broadcast(ResultsPayload) — chainVotes อัปเดต
        SSE-->>FE: onmessage → ledger entry เปลี่ยนเป็น CONFIRMED
        FE-->>S: badge ✓ CONFIRMED + block number
    end

    opt กรณี chain ปฏิเสธ tx ตั้งแต่ตอนส่ง (RPC ล่ม / gas ไม่พอ / ไม่ใช่ owner)
        BC-->>BE: throw Error
        BE->>DB: DELETE votes WHERE id = ? (rollback ให้โหวตใหม่ได้)
        BE-->>FE: 502 Could not submit vote to the blockchain
    end

    opt กรณี tx revert หลัง mine
        RPC-->>BC: receipt.status = 0
        BE->>DB: UPDATE votes SET status = FAILED, error_message = ?
        BE-)SSE: broadcast — คะแนนนี้ไม่ถูกนับ (WHERE status != FAILED)
    end
```

---

## 4. Sequence Diagram — Live Results (SSE) และการตรวจสอบตรงจาก Chain

```mermaid
sequenceDiagram
    autonumber
    actor V as ผู้ชมผล
    participant FE as Next.js<br/>results.tsx
    participant BE as NestJS<br/>VotesService.stream()
    participant DB as PostgreSQL
    participant BC as BlockchainService
    participant RPC as Sepolia RPC<br/>(backend ใช้)
    participant PubRPC as Public Sepolia RPC<br/>(browser ใช้)
    participant SC as Voting.sol

    V->>FE: เปิดหน้า Vote Plus
    FE->>BE: new EventSource("/votes/stream")
    BE->>DB: SELECT candidates · COUNT(votes) GROUP BY candidate_id · ledger 20 แถวล่าสุด
    BE->>BC: getVotes() (cache 5 วินาที)
    BC->>RPC: eth_call getVotes()
    RPC->>SC: view call
    SC-->>RPC: uint256[]
    RPC-->>BC: tally
    BE-->>FE: event: ResultsPayload {candidates[dbVotes, chainVotes], ledger, chain}
    FE-->>V: กราฟคะแนน DB เทียบ Chain + badge "live"

    loop ทุกครั้งที่มีโหวตใหม่ / tx ถูก mine
        BE-)FE: event: ResultsPayload (push อัตโนมัติ)
        FE-->>V: ตัวเลขอัปเดตโดยไม่ต้อง refresh
    end

    V->>FE: กด "ตรวจสอบบน chain เอง"
    Note over FE,PubRPC: ไม่ผ่าน backend เลย — lib/chain.ts
    FE->>PubRPC: eth_call getVotes(), totalVotes(), owner()
    PubRPC->>SC: view calls
    SC-->>PubRPC: ค่าจาก contract storage
    PubRPC-->>FE: OnChainSnapshot {votes[], totalVotes, blockNumber}
    FE-->>V: แสดงตัวเลขจาก chain ตรง ๆ เทียบกับที่ backend ส่งมา
```

---

## สรุปแนวคิด Web 2.5

- **Web 2 (PostgreSQL)** ตอบคำถาม *"ใครโหวตแล้ว"* — ต้องมีตัวตน, ต้องกันโหวตซ้ำ, ต้องรวดเร็ว
- **Web 3 (Smart Contract)** ตอบคำถาม *"คะแนนรวมถูกแก้หรือไม่"* — ใครก็อ่านได้, ไม่มีใครลดคะแนนได้ แม้แต่ owner
- Backend เป็นตัวกลางที่ถือ private key ฝั่งเดียว นักเรียนไม่ต้องมี wallet / จ่าย gas เอง จึงใช้งานง่ายเหมือนเว็บทั่วไป แต่ยังตรวจสอบย้อนหลังได้ผ่าน Etherscan หรือเรียก `getVotes()` ตรงจาก browser
- ถ้าไม่ตั้งค่า `RPC_URL / BACKEND_WALLET_PRIVATE_KEY / VOTING_CONTRACT_ADDRESS` ระบบจะทำงานแบบ `OFF_CHAIN` (เก็บแค่ใน PostgreSQL) เพื่อให้ dev ในเครื่องได้โดยไม่ต้องมี testnet wallet
