# =====================================================================
# Stage 1: build — มี devDependencies ครบเพื่อคอมไพล์ TypeScript
# =====================================================================
FROM node:24-alpine AS build
WORKDIR /app

# คัดลอกแค่ไฟล์ manifest ก่อน เพื่อให้ Docker แคช layer ของ npm ci ไว้ได้
# ถ้าแก้แค่โค้ด (ไม่แตะ package.json) layer นี้จะไม่ต้องรันใหม่ = build เร็วขึ้นมาก
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =====================================================================
# Stage 2: runtime — เอาเฉพาะของที่ต้องใช้ตอนรัน image จึงเล็กลงมาก
# =====================================================================
FROM node:24-alpine AS runtime
WORKDIR /app

# หมายเหตุ: จงใจไม่ตั้ง NODE_ENV=production เพราะ database.config.ts เปิด
# TypeORM synchronize เมื่อ NODE_ENV ไม่ใช่ production ซึ่งจำเป็นตอนนี้เพื่อให้
# ตารางถูกสร้างอัตโนมัติ ถ้าขึ้น production จริงต้องเปลี่ยนไปใช้ migration แทน
COPY package*.json ./
# --omit=dev ตัด devDependencies (typescript, nest cli, vitest ฯลฯ) ออกทั้งหมด
RUN npm ci --omit=dev && npm cache clean --force

# ดึงเฉพาะผลลัพธ์ที่คอมไพล์แล้วจาก stage build ไม่เอา source มาด้วย
COPY --from=build /app/dist ./dist

# รันด้วย user ที่ไม่ใช่ root — ถ้ามีช่องโหว่ ผู้บุกรุกจะไม่ได้สิทธิ์ root ใน container
USER node

EXPOSE 3001
CMD ["node", "dist/main"]
