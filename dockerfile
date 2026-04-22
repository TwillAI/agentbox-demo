# Multi-stage build for Next.js production deployment
FROM --platform=${TARGETPLATFORM:-linux/amd64} node:20-alpine AS base

# Install pnpm (pinned to v10 to match lockfile)
RUN corepack enable
RUN corepack prepare pnpm@10 --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

# Build the application
ENV NODE_OPTIONS="--max_old_space_size=4096"
RUN pnpm run build


FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS runner
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder /app/public ./public
RUN mkdir .next
RUN chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
