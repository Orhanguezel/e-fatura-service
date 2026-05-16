# e-fatura-service — Bun runtime (scraper-service deseni: containerize)
FROM oven/bun:1.3-alpine

WORKDIR /app

# Bağımlılıklar (lockfile ile deterministik)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Kaynak
COPY . .

# Tip kontrolü build-time'da (kırık tip → image build fail)
RUN bun run build

ENV NODE_ENV=production
EXPOSE 8210

# Liveness: healthz 200 değilse unhealthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8210)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER bun
CMD ["bun", "run", "src/server.ts"]
