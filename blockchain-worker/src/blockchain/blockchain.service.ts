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

/**
 * The only component in the whole system that can write to the contract.
 *
 * It holds the wallet private key, which is why this process is kept separate
 * from the API: voting-service can read the chain but can never spend gas or
 * change the tally.
 *
 * This process must run as a SINGLE instance. Every transaction is signed by
 * the same wallet, and a wallet has one nonce sequence — two workers sending
 * at once would collide. `sendQueue` serialises sends within the process;
 * running one replica keeps that guarantee across the cluster.
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  private provider?: JsonRpcProvider;
  private wallet?: Wallet;
  private contract?: Contract;

  private sendQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.contract !== undefined;
  }

  async onModuleInit() {
    const rpcUrl = this.config.get<string>('RPC_URL');
    const privateKey = this.config.get<string>('BACKEND_WALLET_PRIVATE_KEY');
    const address = this.config.get<string>('VOTING_CONTRACT_ADDRESS');

    if (!rpcUrl || !privateKey || !address) {
      this.logger.warn(
        'Blockchain disabled: set RPC_URL, BACKEND_WALLET_PRIVATE_KEY and VOTING_CONTRACT_ADDRESS. Votes will be marked OFF_CHAIN.',
      );
      return;
    }

    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      this.wallet = new Wallet(privateKey, this.provider);
      this.contract = new Contract(
        address,
        VOTING_ABI,
        new NonceManager(this.wallet),
      );

      const network = await this.provider.getNetwork();

      // Fail loudly at boot rather than on the first vote.
      const owner: string = await this.contract.owner();
      if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
        this.logger.error(
          `Wallet ${this.wallet.address} is NOT the contract owner (${owner}). vote() will revert.`,
        );
      }

      this.logger.log(
        `Connected to ${network.name} (chainId ${network.chainId}). Contract ${address}, wallet ${this.wallet.address}`,
      );
    } catch (err) {
      this.contract = undefined;
      this.logger.error(
        `Failed to connect to the chain: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Submits `vote(candidateNumber)` and waits until it is mined.
   *
   * Unlike the old in-process version, waiting here is free: nobody is holding
   * an HTTP request open, and if this process dies the message is still in the
   * queue and will be retried.
   */
  async castVote(candidateNumber: number): Promise<TransactionReceipt> {
    if (!this.contract) {
      throw new Error('Blockchain is not enabled');
    }
    const contract = this.contract;

    const run = this.sendQueue.then(async () => {
      const tx: ContractTransactionResponse =
        await contract.vote(candidateNumber);
      this.logger.log(`vote(${candidateNumber}) submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction ${tx.hash} reverted`);
      }
      this.logger.log(
        `vote(${candidateNumber}) mined in block ${receipt.blockNumber}`,
      );
      return receipt;
    });

    // Keep the queue moving even if this send fails.
    this.sendQueue = run.catch(() => undefined);
    return run;
  }
}
