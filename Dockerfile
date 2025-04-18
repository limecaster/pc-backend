FROM node:20-alpine AS base

# Create app directory
WORKDIR /app

# Install dependencies stage
FROM base AS deps
COPY package.json package-lock.json ./

# Install build dependencies for bcrypt and other native modules
RUN apk add --no-cache make gcc g++ python3

# Install npm dependencies
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install wget for healthcheck
RUN apk add --no-cache wget make gcc g++ python3

# Clean any previous build and use NestJS CLI to build the app
RUN rm -rf dist && \
    npm run build

# Production stage
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install wget for healthcheck and dependencies for bcrypt
RUN apk add --no-cache wget

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.env.production ./.env

# Rebuild bcrypt for the current architecture
RUN apk add --no-cache make gcc g++ python3 && \
    cd /app && \
    npm rebuild bcrypt --build-from-source && \
    apk del make gcc g++ python3

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
USER nestjs

# Expose the port
EXPOSE 3001

# Start the application using the correct path from package.json start:prod script
CMD ["node", "dist/main.js"] 