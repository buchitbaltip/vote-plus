import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // สร้างโฟลเดอร์ .next/standalone ที่มี server.js + เฉพาะ node_modules ที่ใช้จริง
  // ทำให้ image เล็กลงมาก เพราะไม่ต้องคัดลอก node_modules ทั้งก้อนเข้า container
  output: "standalone",
};

export default nextConfig;
