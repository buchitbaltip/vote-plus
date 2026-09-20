/**
 * The five candidates on the ballot. `number` must match the
 * candidateCount the Voting contract was deployed with.
 */
export const CANDIDATE_SEED = [
  {
    number: 1,
    name: 'ณัฐพล ศรีสุข',
    slogan: 'โรงอาหารต้องดีกว่านี้ — เมนูใหม่ทุกสัปดาห์',
    classroom: 'ม.6/1',
  },
  {
    number: 2,
    name: 'พิมพ์ชนก วงศ์ทอง',
    slogan: 'Wi-Fi ทั่วโรงเรียน ไม่ต้องยืนหาสัญญาณ',
    classroom: 'ม.6/2',
  },
  {
    number: 3,
    name: 'ธนกร เพชรรัตน์',
    slogan: 'ชมรมกีฬาครบทุกประเภท เปิดสนามหลังเลิกเรียน',
    classroom: 'ม.5/3',
  },
  {
    number: 4,
    name: 'อริสา บุญมี',
    slogan: 'เสียงนักเรียนต้องถึงครู — กล่องรับความเห็นทุกอาคาร',
    classroom: 'ม.6/4',
  },
  {
    number: 5,
    name: 'กิตติภพ แก้วใส',
    slogan: 'งานกีฬาสี + งานดนตรี ใหญ่กว่าเดิม 2 เท่า',
    classroom: 'ม.5/1',
  },
] as const;
