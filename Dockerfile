# intercom.ts is a Bun program (Bun.serve for the HTTP listener), so this runs
# on the official Bun image rather than Node.
FROM oven/bun:1-alpine

WORKDIR /app

# bun.lock is gitignored in this repo, so resolve fresh. --production skips
# devDependencies; the server only needs the MCP SDK and zod at runtime.
COPY package.json ./
RUN bun install --production

COPY intercom.ts ./
COPY bin ./bin

# Port the peer machine POSTs to. Override with INTERCOM_PORT.
EXPOSE 8788

# INTERCOM_SECRET has no default and the process exits without one, so this
# image needs -e INTERCOM_SECRET=... to start at all. Set MY_ROLE and
# REMOTE_HOST too, to actually pair with another machine.
ENTRYPOINT ["bun", "run", "intercom.ts"]
