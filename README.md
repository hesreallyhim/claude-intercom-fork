# Claude Intercom

Two-way communication bridge between Claude Code sessions using the [Channels API](https://code.claude.com/docs/en/channels-reference).

Let two Claude Code instances on different machines talk to each other in real-time. One sends a message, the other receives it instantly as a channel notification and can reply back.

<img width="1200" height="675" alt="intercom-demo" src="https://github.com/user-attachments/assets/15e4b671-3f66-4712-bf9b-482ba5f3d293" />


## Read this first: Claude Code has native cross-session messaging now

On 7 August 2026, Claude Code v2.1.224 shipped [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) — `ListAgents` and `SendMessage`, built in, nothing to install.

**If you are on macOS or Linux and you want your own sessions to talk to each other, use the native feature.** It is better than this project in every way that matters: no setup, no shared secret, no open port, permission-aware delivery, and same-machine messages never leave your machine. This README is not going to pretend otherwise.

Intercom was built in March 2026, five months before that landed. What follows is an honest account of what each one covers.

### What native messaging covers

| | |
|---|---|
| Your own sessions, same machine | Yes — over a per-session socket, never through Anthropic servers |
| Your own sessions, your other machines | Yes — requires [Remote Control](https://code.claude.com/docs/en/remote-control) on both ends; messages travel through Anthropic servers. Starting a conversation needs v2.1.225+ |
| Your Claude Code on the web sessions | Yes — through Anthropic servers |
| Subagents and agent teams | Yes — same `SendMessage` tool |

### What native messaging does not cover

These are the cases where Intercom is still the answer:

1. **Native Windows.** Cross-session messaging is macOS and Linux only, including Linux inside WSL 2. Anthropic states plainly that it is not offered on native Windows. Intercom is Bun over HTTP and does not care what OS you run.
2. **Two different people.** This is the big one, and it is architectural rather than a gap waiting to be filled. Native messaging connects *your* sessions — the inbox socket is restricted to your own OS user, and cross-machine delivery rides *your* Remote Control connection. A backend dev on their laptop and a frontend dev on theirs are two accounts, and native messaging does not join them. That two-person hotline is the use case Intercom was written for.
3. **Cross-machine without an Anthropic round trip.** Native cross-machine messages relay through Anthropic servers. Intercom POSTs directly over your own network, VPN, or tunnel.
4. **Non-Anthropic providers.** Native messaging is unavailable on Amazon Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, and Microsoft Foundry.
5. **Telemetry-disabled environments.** The feature depends on feature-flag evaluation, so `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_TELEMETRY`, `DO_NOT_TRACK`, or `DISABLE_GROWTHBOOK` turn it off.
6. **Container to host.** Same-machine discovery works through files on disk, so a session inside a container and one on the host cannot see each other. Intercom just needs a reachable port.

### Which should you use

```
Your own sessions, macOS/Linux        ->  native cross-session messaging
Two different developers              ->  Intercom
Native Windows                        ->  Intercom
Bedrock / Vertex / Foundry            ->  Intercom
Must not transit Anthropic servers    ->  Intercom
```

One more difference worth knowing: native messaging is plain text between Claudes and applies the receiving session's own permission rules and inbound controls. Intercom is a raw pipe with a shared secret — anyone holding your secret and address can push text straight into your session. Read [Security](#security) before you expose a port.

## Why?

If you have a backend developer and a frontend developer each running Claude Code on separate machines, they currently have to relay questions through Slack/Discord/copy-paste. Claude Intercom creates a direct hotline between the two AI sessions — one Claude can ask the other about endpoints, schemas, or implementation details and get answers from the actual codebase.

## Architecture

```
Machine A                          Machine B
(e.g. backend dev)                 (e.g. frontend dev)

Claude Code A                      Claude Code B
     |                                  |
     +-- intercom.ts ---HTTP POST----> intercom.ts --+
     |   (channel)     <--HTTP POST--  (channel)     |
     |                                               |
     +-- stdio (MCP) --+        +-- stdio (MCP) -----+
                        |        |
                   Claude A    Claude B
```

Both instances run the same `intercom.ts` file. Each listens for HTTP messages and pushes them into its local Claude Code session via the Channels API. Each also exposes `send_message` and `check_message` tools that Claude can call.

## Requirements

- [Claude Code](https://claude.ai/claude-code) v2.1.80 or later
- [Bun](https://bun.sh) runtime
- Both machines must be able to reach each other over HTTP. [Tailscale](https://tailscale.com) is the recommended way — see [Connecting the two machines](#connecting-the-two-machines)

## Quick Start

### 1. Install

Nothing to install. `npx` fetches it on first run, on both machines.

You do need [Bun](https://bun.sh) on your PATH — the server uses `Bun.serve` for its HTTP listener, and the `npx` entry point hands off to it.

<details>
<summary>Prefer to run from source?</summary>

```bash
git clone https://github.com/MuhammadTalhaMT/claude-intercom.git
cd claude-intercom
bun install
```

Then use `"command": "bun"` with `"args": ["/path/to/claude-intercom/intercom.ts"]` in the config below instead of the `npx` form.

</details>

### 2. Configure

Copy the example config into your project's `.mcp.json`.

First generate a secret, and use the **same value on both machines**:

```bash
openssl rand -base64 32
```

Then export it in the shell you launch Claude Code from, rather than typing it into the config:

```bash
export INTERCOM_SECRET='the-value-you-just-generated'
```

`.mcp.json` is a project file, and project files get committed. [Claude Code expands `${VAR}` in `.mcp.json`](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json) — in `command`, `args`, `env`, `url` and `headers` — so the config below can be checked in and shared with your teammate while the secret itself never leaves your environment.

**Machine A** (e.g. backend — static IP or VPS):

```json
{
  "mcpServers": {
    "intercom": {
      "command": "npx",
      "args": ["-y", "claude-intercom"],
      "env": {
        "MY_ROLE": "backend",
        "REMOTE_HOST": "MACHINE_B_IP:8788",
        "INTERCOM_SECRET": "${INTERCOM_SECRET}",
        "INTERCOM_PORT": "8788"
      }
    }
  }
}
```

**Machine B** (e.g. frontend — can be behind NAT):

```json
{
  "mcpServers": {
    "intercom": {
      "command": "npx",
      "args": ["-y", "claude-intercom"],
      "env": {
        "MY_ROLE": "frontend",
        "REMOTE_HOST": "MACHINE_A_IP:8788",
        "INTERCOM_SECRET": "${INTERCOM_SECRET}",
        "INTERCOM_PORT": "8788"
      }
    }
  }
}
```

### 3. Start

On **both machines**:

```bash
claude --dangerously-load-development-channels server:intercom
```

### 4. Talk

In either Claude Code session:

> "Send a message to the other developer asking what API endpoints are available for the dashboard."

Claude will use the `send_message` tool to POST the message to the other machine. The other Claude receives it as a channel notification and responds.

## Connecting the two machines

**Use [Tailscale](https://tailscale.com).** Install it on both machines and they get stable private addresses on your own tailnet. Then point each side at the other's tailnet address:

```json
"REMOTE_HOST": "other-machine:8788"
```

This is strictly better than exposing a port to the internet: no public listener, no port forwarding, the address doesn't change when your ISP reassigns your IP, and device identity is enforced by Tailscale rather than resting entirely on a shared string. Set `INTERCOM_HOST` to your tailnet address — or to `127.0.0.1` if you are also fronting it with a tunnel — to be certain nothing outside can reach it at all.

<details>
<summary>Alternative: ngrok</summary>

If you can't use Tailscale, [ngrok](https://ngrok.com) still works:

```bash
# On the machine behind NAT
ngrok http 8788
```

```json
"REMOTE_HOST": "your-subdomain.ngrok-free.app"
```

ngrok hostnames are detected and switched to HTTPS automatically. For any other tunnel — Cloudflare, Caddy, a reverse proxy of your own — write the scheme into `REMOTE_HOST` explicitly (`https://your-host`), or the secret goes out over cleartext HTTP.

Note this does put a publicly reachable endpoint in front of your Claude session, gated only by the shared secret — pick a strong one, and consider `INTERCOM_HOST=127.0.0.1` so only the tunnel can reach the listener.

</details>

## Tools

### `send_message`

Sends a message and returns immediately with an **id**. It does not wait for an answer — the reply arrives later as its own inbound message.

| Argument | Required | Description |
|---|---|---|
| `message` | Yes | The text to send |
| `replyTo` | No | The id of the incoming message this answers, so the sender can correlate it |
| `expectReplyWithin` | No | How long a reply should reasonably take: `"30s"`, `"5m"`, `"2h"` |

The acknowledgement deliberately does not claim the other developer received it. An HTTP 200 proves the remote *process* accepted the message, not that the other Claude ever read it.

### `check_message`

Answers the question a fire-and-forget channel otherwise can't: is this reply slow, or is it never coming? Pass an `id`, or omit it to list everything outstanding.

Every message sits in one of three states:

| State | Meaning |
|---|---|
| `sent` | We tried, but the remote process never acked it. The other machine is probably unreachable |
| `delivered-to-process` | Their intercom took it. Their Claude may or may not have read it — that session could be idle, closed, or out of usage |
| `answered` | A reply came back carrying `replyTo` for this id |

`expectReplyWithin` is what makes "overdue" mean anything, and it's **per message** rather than one global timeout — so a quick endpoint lookup and a long investigation aren't judged on the same clock.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `MY_ROLE` | Yes | `developer-a` | Label for this instance (appears in message tags) |
| `REMOTE_HOST` | Yes | `localhost:8789` | Address of the other machine (`host:port` or tunnel URL). Include `https://` for any TLS tunnel that isn't ngrok |
| `INTERCOM_SECRET` | Yes | *none* | Shared secret — must match on both sides. There is no default: unset, left as a docs placeholder, or an unexpanded `${VAR}`, and the intercom refuses to pair |
| `INTERCOM_PORT` | No | `8788` | Port to listen on for incoming messages |
| `INTERCOM_HOST` | No | `0.0.0.0` | Interface to bind the listener to. Use `127.0.0.1` when a tunnel fronts it |
| `INTERCOM_SEND_TIMEOUT_MS` | No | `10000` | How long an outbound POST may hang before giving up |

## How It Works

1. Claude Code spawns `intercom.ts` as a subprocess (MCP server over stdio)
2. The script declares `claude/channel` capability — this registers it as a Channel
3. It starts an HTTP server listening for incoming messages
4. When a message arrives (authenticated via shared secret), it calls `mcp.notification()` with `method: 'notifications/claude/channel'`
5. Claude Code surfaces the notification in the conversation as a `<channel>` tag, carrying the message id
6. Claude reads it and can reply using `send_message` with `replyTo` set to that id, which POSTs to the remote machine
7. The original sender matches the `replyTo` against its own outbound record and marks that message `answered`

The stdio leg is not an implementation detail you can swap for HTTP. It is what attaches the server to a specific live Claude Code session — the `claude/channel` capability is registered over that connection, and it's the reason `mcp.notification()` lands in a conversation at all. Host this remotely and the notification goes to whatever MCP client connected instead.

## Security

- **Shared secret authentication**: `POST /message` requires an `X-Intercom-Secret` header matching the configured secret, compared in constant time. Anything else gets a `401 Unauthorized`. `GET /health` is deliberately *not* authenticated, so you can verify a tunnel end to end — it reports this instance's role and version to anyone who asks, so treat a reachable intercom as discoverable.
- **The secret is only as private as the transport**: it is sent as a plaintext header on every message. Over Tailscale (WireGuard) or an HTTPS tunnel that is fine. Over plain HTTP on a shared network, anyone on the path can read it and then use it.
- **No replay protection**: messages carry an `id` and a `timestamp`, but neither is checked for freshness or reuse. Someone who captures a single authenticated request on a cleartext link can resend it verbatim, as often as they like.
- **No default secret**: `INTERCOM_SECRET` has no fallback value. Leave it unset, leave a docs placeholder in place, or reference a `${VAR}` you never exported, and the intercom starts *unpaired* — it binds no port and `send_message` refuses, explaining why. The unexpanded-`${VAR}` case matters because Claude Code passes a missing variable through as literal text, which would otherwise give both machines the same guessable secret.
- **Inbound is treated as data, not instructions**: the server tells the receiving Claude that a channel message comes from another person's session — it can't approve anything, can't change configuration, a slash command in the text is inert, and requests for credentials or env files should be refused and surfaced to you.
- **No data persistence**: Messages are forwarded in real-time and not stored.
- **Configurable bind address**: By default listens on `0.0.0.0` for cross-machine access. Set `INTERCOM_HOST=127.0.0.1` when a tunnel is doing the reaching, so only the tunnel can connect.

> **Warning**: Those instructions are a default, not a boundary. You cannot fix prompt injection with prompt instructions — anyone holding your secret and address can put text into your Claude session, and the only real limits are that session's own permission prompts. Native cross-session messaging enforces this properly with hold/accept/refuse inbound controls; this does not. Use a strong secret, keep it off the public internet, and don't pair with a peer you wouldn't hand a terminal to.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Returns `{"status":"ok","role":"...","version":"..."}` |
| `POST` | `/message` | `X-Intercom-Secret` header | Pushes message into Claude's session |

`POST /message` body:

```json
{
  "id": "8649f5da",
  "replyTo": "40b0fd17",
  "content": "3 routes, all behind requireTenant()",
  "role": "backend-dev",
  "timestamp": "2026-08-16T09:41:00.000Z"
}
```

`id` and `replyTo` are optional — a message without them still delivers, it just can't be correlated.

The body is schema-validated before anything reaches your session. `content` is required and capped at 32,000 characters; `id` and `replyTo` must look like machine ids (`[A-Za-z0-9_-]`, ≤64); `role` and `timestamp` may not contain `< > " '` or any Unicode control, zero-width, or bidi-override character, because those are what a sender would use to forge the `<channel …>` wrapper the message is rendered inside. Anything else gets a `400`, and a body over 64 KB gets a `413`.

## Use Cases

- **Backend + Frontend collaboration**: Backend Claude answers API questions from frontend Claude using the actual codebase
- **Monorepo with split teams**: Different Claude sessions working on different packages can coordinate
- **Code review relay**: One Claude reviews code and sends findings to the author's Claude session
- **CI/CD notifications**: Point your CI webhook at the intercom to push build results into a Claude session

## Star History

<a href="https://www.star-history.com/?repos=MuhammadTalhaMT%2Fclaude-intercom&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=MuhammadTalhaMT/claude-intercom&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=MuhammadTalhaMT/claude-intercom&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=MuhammadTalhaMT/claude-intercom&type=date&legend=top-left" />
 </picture>
</a>

## License

MIT
