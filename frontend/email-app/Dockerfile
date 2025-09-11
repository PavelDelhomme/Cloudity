# frontend/email-app/Dockerfile.dev - Email App Vue.js
FROM node:18-alpine

WORKDIR /app

# Installation des dépendances système
RUN apk add --no-cache curl

# Copie et installation des dépendances
COPY package*.json ./
RUN npm install

# Copie du code source
COPY . .

# Variables d'environnement pour Vite
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true

# Exposition du port
EXPOSE 8094

# Commande de développement avec hot reload
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]