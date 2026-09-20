// Reads the raw tally straight from the chain — no backend involved.
// Usage: node scripts/read.mjs [contractAddress]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'artifacts', 'Voting.json'), 'utf8'),
);
const address = process.argv[2] ?? process.env.VOTING_CONTRACT_ADDRESS;
if (!address) {
  console.error('Pass a contract address or set VOTING_CONTRACT_ADDRESS');
  process.exit(1);
}
const rpc = process.env.RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const provider = new ethers.JsonRpcProvider(rpc);
const contract = new ethers.Contract(address, artifact.abi, provider);
const [owner, count, total, votes] = await Promise.all([
  contract.owner(),
  contract.candidateCount(),
  contract.totalVotes(),
  contract['getVotes()'](),
]);
console.log(`Contract : ${address}`);
console.log(`Owner    : ${owner}`);
console.log(`Total    : ${total}`);
votes.forEach((v, i) => console.log(`  #${i + 1}: ${v} vote(s)`));
console.log(`(${count} candidates)`);
