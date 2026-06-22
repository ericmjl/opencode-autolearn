FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY . .
RUN mkdir -p /data
EXPOSE 3001
VOLUME ["/data"]
CMD ["bun", "run", "src/cli.ts", "--port", "3001", "--data-dir", "/data"]
