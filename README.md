# Claude Intercom

Two-way communication bridge between Claude Code sessions using the [Channels API](https://code.claude.com/docs/en/channels-reference).

Let two Claude Code instances on different machines talk to each other in real-time. One sends a message, the other receives it instantly as a channel notification and can reply back.

<img width="2020" height="1084" alt="image" src="https://github.com/user-attachments/assets/679e8896-c4dd-4b7b-8066-f0f27b0e8ece" />


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

Both instances run the same `intercom.ts` file. Each listens for HTTP messages and pushes them into its local Claude Code session via the Channels API. Each also exposes a `send_message` tool that Claude can call to send messages to the other machine.

## Requirements

- [Claude Code](https://claude.ai/claude-code) v2.1.80 or later
- [Bun](https://bun.sh) runtime
- Both machines must be able to reach each other over HTTP (direct IP, VPN, or [ngrok](https://ngrok.com))

## Quick Start

### 1. Install

On **both machines**:

```bash
git clone https://github.com/MuhammadTalhaMT/claude-intercom.git
cd claude-intercom
bun install
```

### 2. Configure

Copy the example config into your project's `.mcp.json`:

**Machine A** (e.g. backend — static IP or VPS):

```json
{
  "mcpServers": {
    "intercom": {
      "command": "bun",
      "args": ["/path/to/claude-intercom/intercom.ts"],
      "env": {
        "MY_ROLE": "backend",
        "REMOTE_HOST": "MACHINE_B_IP:8788",
        "INTERCOM_SECRET": "your-shared-secret",
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
      "command": "bun",
      "args": ["/path/to/claude-intercom/intercom.ts"],
      "env": {
        "MY_ROLE": "frontend",
        "REMOTE_HOST": "MACHINE_A_IP:8788",
        "INTERCOM_SECRET": "your-shared-secret",
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

## Behind NAT / Dynamic IP?

If one machine is behind a router (home network, no public IP), use [ngrok](https://ngrok.com):

```bash
# On the machine behind NAT
ngrok http 8788
```

Then set the other machine's `REMOTE_HOST` to the ngrok URL:

```json
"REMOTE_HOST": "your-subdomain.ngrok-free.app"
```

The intercom auto-detects ngrok URLs and switches to HTTPS.

> **Tip:** ngrok's paid plan gives you a static subdomain that never changes, even after restart.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `MY_ROLE` | Yes | `developer-a` | Label for this instance (appears in message tags) |
| `REMOTE_HOST` | Yes | `localhost:8789` | Address of the other machine (`IP:port` or ngrok URL) |
| `INTERCOM_SECRET` | Yes | `change-me-in-production` | Shared secret — must match on both sides |
| `INTERCOM_PORT` | No | `8788` | Port to listen on for incoming messages |

## How It Works

1. Claude Code spawns `intercom.ts` as a subprocess (MCP server over stdio)
2. The script declares `claude/channel` capability — this registers it as a Channel
3. It starts an HTTP server listening for incoming messages
4. When a message arrives (authenticated via shared secret), it calls `mcp.notification()` with `method: 'notifications/claude/channel'`
5. Claude Code surfaces the notification in the conversation as a `<channel>` tag
6. Claude reads it and can reply using the `send_message` tool, which POSTs to the remote machine

## Security

- **Shared secret authentication**: Every message requires an `X-Intercom-Secret` header matching the configured secret. Requests without it get a `401 Unauthorized`.
- **No data persistence**: Messages are forwarded in real-time and not stored.
- **Localhost binding optional**: By default listens on `0.0.0.0` for cross-machine access. Set to `127.0.0.1` if using a tunnel.

> **Warning**: Don't use a weak or default secret in production. Anyone who knows your IP and secret can inject messages into your Claude session.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Returns `{"status":"ok","role":"..."}` |
| `POST` | `/message` | `X-Intercom-Secret` header | Pushes message into Claude's session |

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
