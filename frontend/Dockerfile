# =====================================================================
# Stage 1: build
# =====================================================================
FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# สำคัญ: ตัวแปร NEXT_PUBLIC_* ถูกฝังลงไปในโค้ดตอน build ไม่ใช่ตอน run
# และค่านี้ต้องเป็น URL ที่ "เบราว์เซอร์" เรียกถึงได้ (เบราว์เซอร์อยู่นอก Docker)
# จึงต้องเป็น localhost:3001 ไม่ใช่ voting-service:3001
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SEPOLIA_RPC=$NEXT_PUBLIC_SEPOLIA_RPC

RUN npm run build

# =====================================================================
# Stage 2: runtime — ใช้ผลลัพธ์แบบ standalone
# =====================================================================
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone มี node_modules เท่าที่จำเป็นมาให้ในตัวแล้ว ไม่ต้อง npm ci ซ้ำ
COPY --from=build /app/.next/standalone ./
# 2 โฟลเดอร์นี้ standalone ไม่คัดลอกมาให้ ต้องเอามาเองถ้าไม่ได้ใช้ CDN
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node

EXPOSE 3000
CMD ["node", "server.js"]
