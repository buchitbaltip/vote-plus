/**
 * สัญญา (contract) ของข้อความระหว่าง voting-service กับ blockchain-worker
 *
 * ไฟล์นี้ตั้งใจให้ซ้ำกันทั้งสอง service ถ้าใช้ shared library ร่วมกันจะทำให้
 * การ deploy ผูกกัน — แก้ field เดียวต้อง release พร้อมกันทั้งคู่ การเก็บสำเนา
 * ไว้ที่ละ service ทำให้แต่ละตัว deploy แยกกันได้ ตราบใดที่แก้แบบ backwards
 * compatible
 */

/**
 * ชื่อคิว — คนละอย่างกับชื่อ pattern ด้านล่าง
 *
 * 1 คิวรับได้หลาย pattern (ชื่อ pattern ฝังอยู่ในตัวข้อความ) เช่นคิว
 * vote.results รับทั้ง vote.confirmed และ vote.failed
 */
export const QUEUE_VOTE_TASKS = 'vote.tasks'; // voting-service -> worker
export const QUEUE_VOTE_RESULTS = 'vote.results'; // worker -> voting-service

/** ชื่อ pattern ของข้อความ ใช้กับ emit() และ @EventPattern() */
export const VOTE_CREATED = 'vote.created';
export const VOTE_CONFIRMED = 'vote.confirmed';
export const VOTE_FAILED = 'vote.failed';

/** voting-service -> worker: บันทึกบัตรลงคะแนนแล้ว รอส่งขึ้น chain */
export interface VoteCreatedEvent {
  voteId: string;
  candidateNumber: number;
}

/** worker -> voting-service: transaction ถูก mine เรียบร้อย */
export interface VoteConfirmedEvent {
  voteId: string;
  txHash: string;
  blockNumber: number;
}

/** worker -> voting-service: ส่ง transaction ไม่สำเร็จ */
export interface VoteFailedEvent {
  voteId: string;
  reason: string;
}
