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

# Every setting has a default, so the server starts and answers introspection
# with no configuration. Set MY_ROLE, REMOTE_HOST and INTERCOM_SECRET to
# actually pair with another machine — never run with the default secret.
ENTRYPOINT ["bun", "run", "intercom.ts"]
