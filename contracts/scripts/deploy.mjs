// Deploys Voting.sol to the network in .env (Sepolia by default) and prints
// the address to put into backend/.env as VOTING_CONTRACT_ADDRESS.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'artifacts', 'Voting.json'), 'utf8'),
);

const { RPC_URL, DEPLOYER_PRIVATE_KEY, CANDIDATE_COUNT = '5' } = process.env;
if (!RPC_URL || !DEPLOYER_PRIVATE_KEY) {
  console.error('Set RPC_URL and DEPLOYER_PRIVATE_KEY in contracts/.env (see .env.example)');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);

console.log(`Network : ${network.name} (chainId ${network.chainId})`);
console.log(`Deployer: ${wallet.address}`);
console.log(`Balance : ${ethers.formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error('Deployer has no ETH. Get Sepolia ETH from a faucet first.');
  process.exit(1);
}

const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
console.log(`Deploying Voting(${CANDIDATE_COUNT}) ...`);
const contract = await factory.deploy(BigInt(CANDIDATE_COUNT));
const tx = contract.deploymentTransaction();
console.log(`Tx hash : ${tx.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log('');
console.log(`Voting deployed at: ${address}`);
console.log(`Etherscan: https://sepolia.etherscan.io/address/${address}`);
console.log('');
console.log('Add to backend/.env:');
console.log(`  VOTING_CONTRACT_ADDRESS=${address}`);

const deploymentsPath = path.resolve(__dirname, '..', 'deployments.json');
const deployments = fs.existsSync(deploymentsPath)
  ? JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  : {};
deployments[String(network.chainId)] = {
  address,
  deployer: wallet.address,
  txHash: tx.hash,
  candidateCount: Number(CANDIDATE_COUNT),
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`Saved to ${path.relative(process.cwd(), deploymentsPath)}`);
