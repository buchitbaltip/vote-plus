# Vote Plus — Student-President Election (Web 2.5)

A single-page election dashboard where students log in, cast **one** vote for
one of five candidates, and watch the tally update in real time. Every ballot
is stored in **PostgreSQL** *and* mirrored to a **Solidity smart contract on
the Sepolia testnet**, so the final count can be verified by anyone without
trusting the server.

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 (App Router, one page), CSS Modules, `ethers` (read-only, in-browser verification) |
| Backend | NestJS 12, TypeORM, PostgreSQL, JWT, bcrypt, class-validator, Server-Sent Events, `ethers` |
| Chain | Solidity 0.8 `Voting` contract on Ethereum Sepolia, compiled with `solc`, deployed with `ethers` |

**Live contract (Sepolia):** [`0x10d7B3364369C9A2b4556d3a568b193A4A5B2729`](https://sepolia.etherscan.io/address/0x10d7B3364369C9A2b4556d3a568b193A4A5B2729)
— anyone can open *Read Contract → getVotes* on Etherscan and see the tally without running anything.

---

## Quick start (5 minutes, no wallet needed)

```bash
git clone <this repo> && cd "Vote Plus"

# 1. Backend — needs a PostgreSQL database (any local or cloud instance)
cd backend
npm install
cp .env.example .env        # set DB_* (or DATABASE_URL) and any JWT_SECRET
npm run start:dev           # → http://localhost:3001  (log: "Seeded 5 candidates")

# 2. Frontend (new terminal)
cd ../frontend
npm install
cp .env.example .env.local  # defaults already point at localhost:3001
npm run dev                 # → http://localhost:3000
```

Leave the three blockchain variables in `backend/.env` empty and the app runs
in **OFF_CHAIN** mode: register, vote, live results and every error path
(400 / 401 / 404 / 409) all work against PostgreSQL alone.

To exercise the on-chain path, follow [§3.2](#32-smart-contract-sepolia) with
your own Sepolia wallet — or simply compare the numbers shown in the dashboard
against the live contract linked above.

Secrets are never committed: only `.env.example` files are in the repo.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser  (Next.js, http://localhost:3000)                               │
│                                                                          │
│   ┌────────────┐   ┌──────────────┐   ┌───────────────────────────────┐  │
│   │ Auth panel │   │ Ballot (x5)  │   │ Live results + ledger         │  │
│   │ login /    │   │ select → ✔   │   │ EventSource(/votes/stream)    │  │
│   │ register   │   │              │   │ "อ่านจาก chain" → eth_call ───┼──┼──┐
│   └─────┬──────┘   └──────┬───────┘   └───────────────▲───────────────┘  │  │
└─────────┼─────────────────┼───────────────────────────┼──────────────────┘  │
          │ REST + JWT      │ REST + JWT                │ SSE                  │ JSON-RPC
          ▼                 ▼                           │                      │ (public node,
┌──────────────────────────────────────────────────────────────────────────┐  │  no backend)
│  NestJS API  (http://localhost:3001)                                     │  │
│                                                                          │  │
│  ValidationPipe (DTO + class-validator) ─► Guards (JwtAuthGuard)         │  │
│  ─► Controllers ─► Services ─► TypeORM Repositories                      │  │
│                                                                          │  │
│   AuthModule        CandidatesModule      VotesModule      Blockchain    │  │
│   register/login    ballot list           castVote()       Service       │  │
│   bcrypt + JWT      seed on boot          results/stream   ethers +      │  │
│                                           SSE Subject      NonceManager  │  │
│                                                  │              │        │  │
│  HttpExceptionFilter → uniform { statusCode, error, message, path }      │  │
└──────────────────────────────────────────────────┼──────────────┼────────┘  │
                                                   │              │           │
                                 ┌─────────────────▼───┐   ┌──────▼──────────▼───┐
                                 │ PostgreSQL          │   │ Ethereum Sepolia    │
                                 │ users ─1:0..1─ votes│   │ Voting.sol          │
                                 │ candidates ─1:N─ votes  │ vote(id) onlyOwner  │
                                 │ UNIQUE(votes.user_id)   │ getVotes() view     │
                                 └─────────────────────┘   └─────────────────────┘
```

### Why two data stores? ("Web 2.5")

| Concern | Lives in | Reason |
|---|---|---|
| Who is a student, who already voted | **PostgreSQL** | Needs identity, passwords, a UNIQUE constraint, fast reads. Private data never goes on-chain. |
| How many votes each candidate has | **PostgreSQL** *and* **smart contract** | DB for speed/real-time; chain as a public, append-only, tamper-evident tally. |
| Proof that a specific ballot was counted | `votes.tx_hash` → Etherscan | Each row keeps the hash of the transaction that incremented the on-chain counter. |

The backend wallet is the contract **owner**; only it can call `vote()`. The
contract has no "set votes" function — the tally can only ever go up by one,
one transaction at a time, and every transaction is public.

### Vote flow (sequence)

```
Student            Next.js             NestJS                 PostgreSQL          Sepolia
  │  click ✔ ยืนยัน   │                     │                        │                  │
  │──────────────────►│ POST /votes         │                        │                  │
  │                   │ Authorization:Bearer│                        │                  │
  │                   │────────────────────►│ JwtAuthGuard ✔         │                  │
  │                   │                     │ ValidationPipe ✔       │                  │
  │                   │                     │ candidate exists?  ───►│ SELECT           │
  │                   │                     │ user already voted? ──►│ SELECT           │
  │                   │                     │ INSERT vote PENDING ──►│ UNIQUE(user_id)  │
  │                   │                     │ contract.vote(number) ─┼─────────────────►│ tx submitted
  │                   │                     │◄───────────────────────┼──── txHash ──────│
  │                   │                     │ UPDATE tx_hash ───────►│                  │
  │                   │◄── 201 {PENDING,txHash}                      │                  │
  │◄── "รอยืนยันบน chain" + Etherscan link  │                        │                  │
  │                   │◄── SSE results ─────│ broadcast()            │                  │
  │                   │                     │      … ~12 s later …   │                  │
  │                   │                     │◄─── receipt (block N) ─┼──────────────────│ mined
  │                   │                     │ UPDATE CONFIRMED, block│                  │
  │                   │◄── SSE results ─────│ broadcast()            │                  │
  │◄── "ยืนยันบน chain แล้ว · block #N"     │                        │                  │
```

Failure handling along that path:

| Situation | Result |
|---|---|
| Bad body (`candidateId` missing / not int) | `400` from `ValidationPipe` |
| No / expired token | `401` from `JwtAuthGuard` |
| Unknown candidate | `404 NotFoundException` |
| Second vote from same user (even concurrent) | `409 ConflictException` — DB UNIQUE index is the real guard |
| RPC down / wallet out of gas / not owner | `502 BadGatewayException`; the PENDING row is **deleted** so the student can retry |
| Tx reverted after being mined | row flipped to `FAILED` (excluded from tally) and broadcast |
| Any unexpected error | `500` with a generic message; stack logged server-side |

### Database schema

```
users                          votes                              candidates
─────────────────────          ────────────────────────────       ─────────────────────
id           uuid PK           id            uuid PK              id         serial PK
username     varchar UNIQUE    user_id       uuid FK → users      number     smallint UNIQUE  ← id used on-chain
password_hash varchar          candidate_id  int  FK → candidates name       varchar
created_at   timestamptz       status        enum PENDING|CONFIRMED|FAILED|OFF_CHAIN
                               tx_hash       varchar(66) NULL     slogan     varchar
                               block_number  int NULL             classroom  varchar
                               error_message text NULL            created_at timestamptz
                               created_at / updated_at
                               UNIQUE (user_id)   ← one vote per student
```

* `password_hash` has `select: false` in the entity, so it never leaks through
  a normal query result.
* `ON DELETE CASCADE` on `user_id`, `ON DELETE RESTRICT` on `candidate_id`
  (you cannot delete a candidate who has votes).
* Tables are created by TypeORM `synchronize` in development; production would
  switch that off and use migrations.

### Smart contract — [`contracts/Voting.sol`](contracts/Voting.sol)

```solidity
address public immutable owner;          // backend wallet
uint256 public immutable candidateCount; // 5
mapping(uint256 => uint256) private votes;
uint256 public totalVotes;

event Voted(uint256 indexed candidateId, uint256 newTotal, uint256 totalVotes);

function vote(uint256 candidateId) external onlyOwner;   // +1, emits Voted
function getVotes() external view returns (uint256[]);   // [c1, c2, c3, c4, c5]
function getVotes(uint256 candidateId) external view returns (uint256);
```

Deliberately minimal: state can only change through `vote()`, `vote()` can
only add one, and only the backend wallet can call it. Reads are free `view`
calls that anyone can make.

### Real-time

`GET /votes/stream` is a NestJS `@Sse()` endpoint backed by an RxJS `Subject`.
`VotesService.broadcast()` pushes a fresh `ResultsPayload` after every
insert and every confirmation; the browser subscribes with the native
`EventSource` (auto-reconnect, no socket library).

---

## 2. How to verify the blockchain integration is real

Reviewers do not have to trust the API. Four independent checks:

1. **Contract on Etherscan** — open
   `https://sepolia.etherscan.io/address/<VOTING_CONTRACT_ADDRESS>#code`.
   The source is verified there, so you can read `vote()` / `getVotes()` and
   call `getVotes` under *Read Contract* yourself.
2. **Every ballot links to its transaction** — the ledger at the bottom of the
   dashboard shows a tx hash per vote. Open one: `To` is the contract,
   `Input Data` decodes to `vote(uint256 candidateId)`, and the `Voted`
   event is in *Logs*.
3. **"อ่านจาก chain" button** — the browser calls `getVotes()` through a
   public Sepolia RPC using [`frontend/src/lib/chain.ts`](frontend/src/lib/chain.ts).
   The backend is not in that path at all; compare the numbers with the DB
   column next to them.
4. **CLI** — `cd contracts && npm run read -- <address>` prints the tally
   straight from the node.

The DB and chain totals differ only while a transaction is still pending
(~12 s), which the UI labels explicitly.

---

## 3. Running it

### Prerequisites

* Node.js ≥ 20
* A PostgreSQL database — local, or a free cloud one
  ([Neon](https://neon.tech) / [Supabase](https://supabase.com))
* *(optional, for on-chain mode)* a wallet with a little Sepolia ETH from a
  faucet (e.g. Google Cloud / Alchemy / Infura Sepolia faucet)

### 3.1 Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit .env
npm run start:dev         # http://localhost:3001
```

Minimum `.env`:

```ini
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require   # or DB_HOST/DB_PORT/...
JWT_SECRET=<any long random string>
```

Leave the blockchain variables blank and the app runs in **OFF_CHAIN** mode
(votes recorded in PostgreSQL only, dashboard shows an "OFF-CHAIN" badge).
Environment variables are validated at boot with class-validator — a typo
fails fast with a readable message.

### 3.2 Smart contract (Sepolia)

```bash
cd contracts
npm install
cp .env.example .env      # RPC_URL, DEPLOYER_PRIVATE_KEY
npm run compile           # → artifacts/Voting.json + backend/src/blockchain/voting.abi.ts
npm run deploy            # prints the contract address
npm run read -- 0xYourContractAddress
```

Then put into `backend/.env`:

```ini
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BACKEND_WALLET_PRIVATE_KEY=0x…   # the same key that deployed (= owner)
VOTING_CONTRACT_ADDRESS=0x…
```

Restart the backend; the log should show
`Connected to sepolia (chainId 11155111). Contract 0x…, 5 candidates`.

To verify the source on Etherscan: *Contract → Verify & Publish → Solidity
(Single file)*, compiler `v0.8.x` (printed by `npm run compile`),
optimisation **Yes / 200 runs**, paste `Voting.sol`, constructor argument `5`.

### 3.3 Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Defaults to `http://localhost:3001` for the API; override with
`NEXT_PUBLIC_API_URL`. `NEXT_PUBLIC_SEPOLIA_RPC` changes the public node used
for in-browser verification.

---

## 4. API reference

All errors share one shape:
`{ statusCode, error, message, path, timestamp }`.

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| `POST` | `/auth/register` | – | `201 { accessToken, user }` | `400` validation · `409` username taken |
| `POST` | `/auth/login` | – | `200 { accessToken, user }` | `400` · `401` bad credentials |
| `GET` | `/auth/me` | Bearer | `200 { id, username }` | `401` |
| `GET` | `/candidates` | – | `200 Candidate[]` | |
| `GET` | `/candidates/:id` | – | `200 Candidate` | `400` non-numeric · `404` |
| `POST` | `/votes` | Bearer | `201 MyVote` (status `PENDING` / `OFF_CHAIN`) | `400` · `401` · `404` · `409` already voted · `502` chain error |
| `GET` | `/votes/me` | Bearer | `200 MyVote \| null` | `401` |
| `GET` | `/votes/results` | – | `200 ResultsPayload` (DB + chain tally, ledger) | |
| `GET` | `/votes/stream` | – | `text/event-stream` of `ResultsPayload` | |

Example:

```bash
curl -X POST localhost:3001/auth/register -H 'Content-Type: application/json' \
     -d '{"username":"alice","password":"secret123"}'
# → {"accessToken":"eyJ…","user":{"id":"…","username":"alice"}}

curl -X POST localhost:3001/votes -H "Authorization: Bearer eyJ…" \
     -H 'Content-Type: application/json' -d '{"candidateId":2}'
# → {"id":"…","candidateNumber":2,"status":"PENDING","txHash":"0x…"}
```

---

## 5. Project layout

```
Vote Plus/
├── backend/                    NestJS API
│   └── src/
│       ├── main.ts             bootstrap: CORS, ValidationPipe, HttpExceptionFilter
│       ├── app.module.ts       ConfigModule (validated env) + TypeORM + feature modules
│       ├── config/             env.validation.ts, database.config.ts
│       ├── common/             HttpExceptionFilter, @CurrentUser() decorator
│       ├── auth/               register/login, bcrypt, JwtAuthGuard, DTOs
│       ├── users/              User entity + repository service
│       ├── candidates/         Candidate entity, seed, public endpoints
│       ├── votes/              Vote entity (FKs, UNIQUE), business logic, results, SSE
│       └── blockchain/         BlockchainService (ethers), generated voting.abi.ts
├── contracts/                  Voting.sol + compile / deploy / read scripts (solc, ethers)
│   └── artifacts/Voting.json   ABI + bytecode (generated)
├── frontend/                   Next.js single page
│   └── src/
│       ├── app/page.tsx        auth + ballot + live results, all on one route
│       ├── app/auth-panel.tsx  login / register
│       ├── app/ballot.tsx      candidate picker + confirm
│       ├── app/results.tsx     live tally, on-chain verify, ledger
│       └── lib/                api.ts (REST client), chain.ts (browser → RPC), types.ts
└── README.md
```

---

## 6. Backend concepts demonstrated (checklist)

| Concept | Where |
|---|---|
| REST API design + HTTP status codes | `*.controller.ts`, table above |
| PostgreSQL / relational model | `*.entity.ts`, TypeORM |
| Foreign keys & relationships | `Vote` → `User` (1:0..1, UNIQUE) and → `Candidate` (N:1) |
| DTO + `class-validator` | `auth/dto/*.dto.ts`, `votes/dto/cast-vote.dto.ts`, global `ValidationPipe` |
| Env validation with the same tooling | `config/env.validation.ts` |
| JWT authentication | `AuthService.issueToken`, `@nestjs/jwt` |
| Guard (authorization) | `auth/jwt-auth.guard.ts` + `@CurrentUser()` |
| bcrypt password hashing | `AuthService` (12 rounds, constant-time compare, dummy hash on unknown user) |
| CRUD | users, candidates, votes services |
| Business logic | `VotesService.castVote` (validate → insert → chain → confirm) |
| Exception handling | `HttpExceptionFilter`, typed `HttpException`s, PG `23505` → `409` |
| Real-time | `@Sse()` + RxJS `Subject` |
| Blockchain integration | `BlockchainService` (ethers, `NonceManager`, owner check at boot, tx queue) |

## 7. Trade-offs and next steps

* **Backend pays gas / custodial signing.** Students do not need wallets,
  which is the right call for a school; the cost is that the backend is a
  trusted party for *submitting* votes (not for *counting* them — the chain
  guards that). A `bytes32 voterHash` argument on `vote()` would let each
  student prove their own ballot without revealing identity.
* **`synchronize: true`** is dev-only; migrations belong in production.
* JWT lives in `localStorage` for simplicity; an httpOnly cookie would resist
  XSS better.
* No rate limiting on `/auth/*` yet (`@nestjs/throttler` is a one-line add).
* Tests: unit tests for `VotesService` (mock the repository and
  `BlockchainService`) and an e2e run against a throw-away Postgres would be
  the next thing to add.
