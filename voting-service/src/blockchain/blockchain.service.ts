import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Contract,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  type ContractTransactionResponse,
  type TransactionReceipt,
} from 'ethers';
import { VOTING_ABI } from './voting.abi.js';

export interface ChainInfo {
  enabled: boolean;
  chainId: number | null;
  networkName: string | null;
  contractAddress: string | null;
  backendWallet: string | null;
  explorerUrl: string;
}

export interface SubmittedVote {
  txHash: string;
  /** Resolves when the tx is mined (or rejects if it reverts / is dropped). */
  confirmation: Promise<TransactionReceipt>;
}

const TALLY_CACHE_MS = 5_000;

/**
 * Thin wrapper around the Voting contract.
 *
 * If RPC_URL / BACKEND_WALLET_PRIVATE_KEY / VOTING_CONTRACT_ADDRESS are not
 * set, the service reports `enabled: false` and VotesService records votes
 * as OFF_CHAIN. That keeps the app runnable for local development without a
 * funded testnet wallet.
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  private provider?: JsonRpcProvider;
  private wallet?: Wallet;
  private contract?: Contract;
  private chainId: number | null = null;
  private networkName: string | null = null;

  // Serialise sends so two students voting at the same second never race
  // for the same nonce. NonceManager tracks nonces locally; the queue keeps
  // the sends ordered.
  private sendQueue: Promise<unknown> = Promise.resolve();

  private tallyCache?: { at: number; value: number[] };

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.contract !== undefined;
  }

  get contractAddress(): string | null {
    return this.config.get<string>('VOTING_CONTRACT_ADDRESS') ?? null;
  }

  get explorerUrl(): string {
    return this.config.get<string>('EXPLORER_URL', 'https://sepolia.etherscan.io');
  }

  async onModuleInit() {
    const rpcUrl = this.config.get<string>('RPC_URL');
    const privateKey = this.config.get<string>('BACKEND_WALLET_PRIVATE_KEY');
    const address = this.contractAddress;

    if (!rpcUrl || !privateKey || !address) {
      this.logger.warn(
        'Blockchain disabled: set RPC_URL, BACKEND_WALLET_PRIVATE_KEY and VOTING_CONTRACT_ADDRESS to enable. Votes will be recorded OFF_CHAIN.',
      );
      return;
    }

    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      this.wallet = new Wallet(privateKey, this.provider);
      const signer = new NonceManager(this.wallet);
      this.contract = new Contract(address, VOTING_ABI, signer);

      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      this.networkName = network.name;

      // Sanity checks so misconfiguration is obvious at boot, not at first vote.
      const owner: string = await this.contract.owner();
      if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
        this.logger.error(
          `Backend wallet ${this.wallet.address} is NOT the contract owner (${owner}). vote() calls will revert.`,
        );
      }
      const count = Number(await this.contract.candidateCount());
      this.logger.log(
        `Connected to ${this.networkName} (chainId ${this.chainId}). Contract ${address}, ${count} candidates, wallet ${this.wallet.address}`,
      );
    } catch (err) {
      this.contract = undefined;
      this.logger.error(
        `Failed to connect to blockchain, falling back to OFF_CHAIN: ${(err as Error).message}`,
      );
    }
  }

  getChainInfo(): ChainInfo {
    return {
      enabled: this.enabled,
      chainId: this.chainId,
      networkName: this.networkName,
      contractAddress: this.enabled ? this.contractAddress : null,
      backendWallet: this.wallet?.address ?? null,
      explorerUrl: this.explorerUrl,
    };
  }

  /**
   * Submit `vote(candidateNumber)`; resolves as soon as the tx is accepted
   * by the node (hash known). Mining is awaited via `confirmation`.
   */
  castVote(candidateNumber: number): Promise<SubmittedVote> {
    if (!this.contract) {
      throw new Error('Blockchain is not enabled');
    }
    const contract = this.contract;

    const run = this.sendQueue.then(async () => {
      const tx: ContractTransactionResponse = await contract.vote(candidateNumber);
      this.logger.log(`vote(${candidateNumber}) submitted: ${tx.hash}`);
      this.tallyCache = undefined;
      const confirmation = tx.wait().then((receipt) => {
        if (!receipt || receipt.status !== 1) {
          throw new Error(`Transaction ${tx.hash} reverted`);
        }
        this.logger.log(`vote(${candidateNumber}) mined in block ${receipt.blockNumber}`);
        this.tallyCache = undefined;
        return receipt;
      });
      return { txHash: tx.hash, confirmation } satisfies SubmittedVote;
    });

    // Keep the queue alive even if this send fails.
    this.sendQueue = run.catch(() => undefined);
    return run;
  }

  /** Raw tally straight from the contract (`getVotes()`), cached briefly. */
  async getVotes(): Promise<number[]> {
    if (!this.contract) {
      throw new Error('Blockchain is not enabled');
    }
    const now = Date.now();
    if (this.tallyCache && now - this.tallyCache.at < TALLY_CACHE_MS) {
      return this.tallyCache.value;
    }
    const raw: bigint[] = await this.contract['getVotes()']();
    const value = raw.map((v) => Number(v));
    this.tallyCache = { at: now, value };
    return value;
  }
}
