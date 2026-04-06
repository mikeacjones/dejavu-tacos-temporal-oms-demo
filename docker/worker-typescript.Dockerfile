FROM node:22-slim AS build

WORKDIR /app
COPY workflows/typescript/package.json workflows/typescript/package-lock.json* ./
RUN npm install
COPY workflows/typescript/ .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/lib ./lib
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json .

CMD ["node", "lib/worker.js"]
