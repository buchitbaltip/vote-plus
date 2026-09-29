# =====================================================================
# Stage 1: build — คอมไพล์ TypeScript
# =====================================================================
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =====================================================================
# Stage 2: runtime
# =====================================================================
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node

# ไม่มี EXPOSE เพราะ worker ไม่เปิด port ใด ๆ เลย
# มันเชื่อมต่อ "ออก" ไปหา RabbitMQ อย่างเดียว ไม่มีใครเรียกเข้ามาได้
CMD ["node", "dist/main"]
