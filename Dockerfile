FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY vendor ./vendor
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/frontend/package.json ./frontend/package.json
COPY --from=build /app/vendor ./vendor
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/config ./config
RUN mkdir data research-control && chown node:node data research-control
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/src/server.js"]
