FROM node:20 AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Debug to verify files exist
RUN ls -la

# Add explicit tsconfig copy if it doesn't exist
RUN if [ ! -f tsconfig.json ]; then \
    echo '{"compilerOptions":{"module":"commonjs","declaration":true,"removeComments":true,"emitDecoratorMetadata":true,"experimentalDecorators":true,"target":"es2017","sourceMap":true,"outDir":"./dist","baseUrl":"./","incremental":true}}' > tsconfig.json; \
    fi

# Debug tsconfig
RUN cat tsconfig.json

# Force clear dist directory if it exists
RUN rm -rf dist

# Build the application with verbose output
RUN npm run build
RUN ls -la dist

# Production image
FROM node:20 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
RUN if [ -f /app/tsconfig.build.json ]; then cp /app/tsconfig.build.json ./tsconfig.build.json; fi

# Debug to verify files exist in production image
RUN ls -la
RUN ls -la dist || echo "dist directory not found or empty"

EXPOSE 3001

# Use node to run the application
CMD ["node", "dist/src/main.js"]
