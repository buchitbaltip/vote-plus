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
 * ตัวเดียวในระบบทั้งหมดที่เขียนลง contract ได้
 *
 * มันถือ private key ของ wallet ซึ่งเป็นเหตุผลที่แยก process นี้ออกจาก API —
 * voting-service อ่าน chain ได้ แต่ไม่มีวันจ่าย gas หรือแก้คะแนนได้เลย
 *
 * process นี้ต้องรันแค่ instance เดียวเท่านั้น เพราะทุก transaction เซ็นด้วย
 * wallet เดียวกัน และ wallet หนึ่งมี nonce ชุดเดียว ถ้ามี worker 2 ตัวส่ง
 * พร้อมกันจะชนกัน — `sendQueue` เรียงคิวการส่งภายใน process ส่วนการรัน
 * replica เดียวคือสิ่งที่รักษาการันตีนี้ในระดับ cluster
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

      // ให้พังตั้งแต่ตอน boot ดีกว่าไปพังตอนมีคนโหวตครั้งแรก
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
   * ส่ง `vote(candidateNumber)` แล้วรอจนกว่าจะถูก mine
   *
   * ต่างจากเวอร์ชันเดิมที่อยู่ใน API ตรงที่การรอตรงนี้ไม่เสียอะไรเลย — ไม่มีใคร
   * ค้าง HTTP request รออยู่ และถ้า process นี้ตาย ข้อความยังอยู่ในคิว
   * เดี๋ยวก็ถูกส่งมาให้ทำใหม่
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

    // ต่อคิวไว้ ถ้าการส่งครั้งนี้ล้มก็ไม่ทำให้คิวค้าง
    this.sendQueue = run.catch(() => undefined);
    return run;
  }
}
