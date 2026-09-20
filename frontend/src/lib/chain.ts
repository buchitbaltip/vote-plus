import { Contract, JsonRpcProvider } from "ethers";

/**
 * Independent verification: the browser talks to a public Sepolia RPC node
 * directly and calls `getVotes()` on the contract. The backend is not
 * involved at all, so the number shown here cannot be faked by the API.
 */
const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ??
  "https://ethereum-sepolia-rpc.publicnode.com";

// Only the read functions we need. Full ABI lives in contracts/artifacts.
const VOTING_READ_ABI = [
  "function getVotes() view returns (uint256[])",
  "function totalVotes() view returns (uint256)",
  "function candidateCount() view returns (uint256)",
  "function owner() view returns (address)",
];

export interface OnChainSnapshot {
  votes: number[];
  totalVotes: number;
  candidateCount: number;
  owner: string;
  blockNumber: number;
  rpcUrl: string;
  fetchedAt: string;
}

export async function readOnChain(
  contractAddress: string,
): Promise<OnChainSnapshot> {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const contract = new Contract(contractAddress, VOTING_READ_ABI, provider);
  const [votes, totalVotes, candidateCount, owner, blockNumber] =
    await Promise.all([
      contract.getVotes() as Promise<bigint[]>,
      contract.totalVotes() as Promise<bigint>,
      contract.candidateCount() as Promise<bigint>,
      contract.owner() as Promise<string>,
      provider.getBlockNumber(),
    ]);
  return {
    votes: votes.map(Number),
    totalVotes: Number(totalVotes),
    candidateCount: Number(candidateCount),
    owner,
    blockNumber,
    rpcUrl: SEPOLIA_RPC,
    fetchedAt: new Date().toISOString(),
  };
}
