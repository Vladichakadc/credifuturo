FROM node:18-alpine

WORKDIR /app

# Copiar todo el codigo fuente
COPY . .

# Instalar dependencias del servidor
RUN cd server && npm install --omit=dev

# Instalar dependencias del cliente y construir
RUN cd client && npm install && npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/server.js"]
