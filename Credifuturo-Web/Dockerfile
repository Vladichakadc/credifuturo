FROM node:18-alpine

WORKDIR /app

COPY . .

RUN cd server && npm install --omit=dev
RUN cd client && npm install && npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/server.js"]
