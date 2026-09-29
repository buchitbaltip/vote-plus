import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider } from 'ethers';
import { VOTING_ABI } from './voting.abi.js';

export interface ChainInfo {
  enabled: boolean;
  chainId: number | null;
  networkName: string | null;
  contractAddress: string | null;
  backendWallet: string | null;
  explorerUrl: string;
}

const TALLY_CACHE_MS = 5_000;

/**
 * ตัวอ่าน chain แบบ read-only
 *
 * service นี้ "ไม่มี" private key เลย มันทำได้แค่เรียก view function อย่าง
 * getVotes() กับ owner() ซึ่งเป็นการอ่านที่ใครก็เรียกได้ฟรี ไม่ต้องเซ็น
 * ไม่เสีย gas
 *
 * การเขียนลง contract ทั้งหมดอยู่ที่ blockchain-worker ที่เดียว แปลว่าต่อให้
 * ใครเจาะเข้ามาที่ service นี้ได้ ก็ยังแก้คะแนนบน chain ไม่ได้อยู่ดี
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  private provider?: JsonRpcProvider;
  private contract?: Contract;
  private chainId: number | null = null;
  private networkName: string | null = null;
  /** address ของ owner อ่านมาจาก contract ตอน boot ไม่ได้มาจาก key ในเครื่อง */
  private ownerAddress: string | null = null;

  private tallyCache?: { at: number; value: number[] };

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.contract !== undefined;
  }

  get contractAddress(): string | null {
    return this.config.get<string>('VOTING_CONTRACT_ADDRESS') ?? null;
  }

  get explorerUrl(): string {
    return this.config.get<string>(
      'EXPLORER_URL',
      'https://sepolia.etherscan.io',
    );
  }

  async onModuleInit() {
    const rpcUrl = this.config.get<string>('RPC_URL');
    const address = this.contractAddress;

    // ต้องการแค่ 2 ค่า ไม่ต้องใช้ private key เพราะอ่านอย่างเดียว
    if (!rpcUrl || !address) {
      this.logger.warn(
        'อ่าน chain ไม่ได้: ยังไม่ได้ตั้ง RPC_URL หรือ VOTING_CONTRACT_ADDRESS — คะแนนบน chain จะไม่แสดง',
      );
      return;
    }

    try {
      this.provider = new JsonRpcProvider(rpcUrl);
      this.contract = new Contract(address, VOTING_ABI, this.provider);

      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);
      this.networkName = network.name;
      this.ownerAddress = (await this.contract.owner()) as string;

      const count = Number(await this.contract.candidateCount());
      this.logger.log(
        `อ่าน ${this.networkName} (chainId ${this.chainId}) ได้ — contract ${address}, ผู้สมัคร ${count} คน, owner ${this.ownerAddress}`,
      );
    } catch (err) {
      this.contract = undefined;
      this.logger.error(`ต่อ chain ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  getChainInfo(): ChainInfo {
    return {
      enabled: this.enabled,
      chainId: this.chainId,
      networkName: this.networkName,
      contractAddress: this.enabled ? this.contractAddress : null,
      backendWallet: this.ownerAddress,
      explorerUrl: this.explorerUrl,
    };
  }

  /** คะแนนดิบจาก contract โดยตรง (`getVotes()`) แคชไว้สั้น ๆ */
  async getVotes(): Promise<number[]> {
    if (!this.contract) {
      throw new Error('ยังไม่ได้ตั้งค่า chain');
    }
    const now = Date.now();
    if (this.tallyCache && now - this.tallyCache.at < TALLY_CACHE_MS) {
      return this.tallyCache.value;
    }
    // แคช 5 วินาที กันไม่ให้ทุก SSE connection ยิง RPC พร้อมกันรัว ๆ
    const raw: bigint[] = await this.contract['getVotes()']();
    const value = raw.map((v) => Number(v));
    this.tallyCache = { at: now, value };
    return value;
  }

  /** ล้างแคชเมื่อรู้ว่าคะแนนบน chain เพิ่งเปลี่ยน (worker แจ้งมา) */
  invalidateTallyCache() {
    this.tallyCache = undefined;
  }
}
