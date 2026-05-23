FROM node:18-alpine

WORKDIR /app

COPY . .

# Clean any stale build artifacts to ensure a fresh client build every time
RUN rm -rf client/dist client/node_modules/.vite client/node_modules/.cache

RUN cd server && npm install --omit=dev
RUN cd client && npm install && npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/server.js"]
