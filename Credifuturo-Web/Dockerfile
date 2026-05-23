FROM node:18-alpine

WORKDIR /app

# Copiar manifiestos de dependencias primero (mejor cache de Docker)
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY package.json ./

# Instalar dependencias del servidor
RUN cd server && npm install --omit=dev

# Instalar dependencias del cliente y construir
RUN cd client && npm install && npm run build

# Copiar el resto del codigo fuente
COPY server/ ./server/
COPY client/ ./client/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/server.js"]
