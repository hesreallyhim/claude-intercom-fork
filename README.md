# Claude Intercom

Two-way communication bridge between Claude Code sessions using the [Channels API](https://code.claude.com/docs/en/channels-reference).

Let two Claude Code instances on different machines talk to each other in real-time. One sends a message, the other receives it instantly as a channel notification and can reply back.

<img width="1200" height="675" alt="intercom-demo" src="https://github.com/user-attachments/assets/15e4b671-3f66-4712-bf9b-482ba5f3d293" />


## What Intercom does that native can't

Claude Code has [native cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) now. Here's where Intercom is still the answer:

- **Two different people.** This is the big one. Native connects *your* sessions — the inbox is tied to your own OS user and cross-machine delivery rides your own Remote Control. A backend dev on their laptop and a frontend dev on theirs are two accounts, and native can't join them. That two-person hotline is exactly what Intercom was built for.
- **Native Windows.** Native messaging is macOS and Linux only. Intercom is Bun over HTTP and doesn't care what OS you run.
- **Your network, not Anthropic's.** Native cross-machine messages relay through Anthropic servers. Intercom POSTs straight over your own network, VPN or tunnel.
- **Any provider.** Works on Bedrock, Vertex and Foundry, and in telemetry-disabled environments, where native messaging is switched off.
- **Container to host.** Native discovery works through files on disk, so a session in a container and one on the host can't see each other. Intercom just needs a reachable port.
- **Honest delivery.** `send_message` reports `sent`, `delivered-to-process` and `answered` as three separate states, plus a `check_message` tool. You find out when the other side never picked it up, instead of planning around an answer that was never coming.

If you're on macOS or Linux and you just want your own sessions talking to each other, native is simpler — use that. Everything else above is what this is for.

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

## Set it up with Claude

Paste this into a Claude Code session on each machine and it will walk you
through the whole thing. Run it on machine A first, keep the secret it gives
you, then run it on machine B.

````text
Set up claude-intercom on this machine so this Claude Code session can message
a Claude Code session on my other machine.

Work through this in order, and stop and ask me whenever you need something
only I can tell you.

1. Check prerequisites. Confirm `bun --version` works and that `claude --version`
   is 2.1.80 or newer. If Bun is missing, tell me how to install it for my OS
   and stop there.

2. Work out how the two machines will reach each other. Run `tailscale ip -4`.
   If that returns an address we'll use Tailscale. If Tailscale isn't installed,
   tell me it's the recommended option and ask whether I want to install it or
   use something else.

3. Ask me these, one at a time:
   - a short role name for THIS machine, e.g. "frontend", "vps", "laptop"
   - the address of the OTHER machine (hostname or IP)
   - whether this is the first machine I'm setting up or the second

4. Handle the shared secret.
   - First machine: generate a strong random secret, show it to me once, and
     tell me I'll need it when I run this on the other machine.
   - Second machine: ask me to paste the secret from the first one.
   Both machines must end up with exactly the same secret.

5. Write `.mcp.json` in this project with an "intercom" server: command `npx`,
   args `["-y", "claude-intercom"]`, and env `MY_ROLE`, `REMOTE_HOST` (the other
   machine plus `:8788`), `INTERCOM_SECRET`, `INTERCOM_PORT` set to 8788.
   If `.mcp.json` already exists, merge the intercom entry into it instead of
   overwriting the file. Make sure `.mcp.json` is gitignored, it holds the secret.

6. Tell me to restart Claude Code on this machine with:
   `claude --dangerously-load-development-channels server:intercom`
   and explain that the flag is needed because the channels capability is still
   experimental, and that messages only arrive while both sides are running.

7. Once both machines are up, tell me to test it by asking one session to send
   a message to the other. Remind me that `send_message` reports sent /
   delivered-to-process / answered separately, so "delivered" means the remote
   process accepted it, not that the other Claude has read it.

Don't invent configuration keys. The only environment variables are MY_ROLE,
REMOTE_HOST, INTERCOM_SECRET, INTERCOM_PORT and INTERCOM_SEND_TIMEOUT_MS.
````

Prefer to do it by hand? The manual steps are below.

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

Copy the example config into your project's `.mcp.json`:

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
      "command": "npx",
      "args": ["-y", "claude-intercom"],
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

## Connecting the two machines

**Use [Tailscale](https://tailscale.com).** Install it on both machines and they get stable private addresses on your own tailnet. Then point each side at the other's tailnet address:

```json
"REMOTE_HOST": "other-machine:8788"
```

This is strictly better than exposing a port to the internet: no public listener, no port forwarding, the address doesn't change when your ISP reassigns your IP, and device identity is enforced by Tailscale rather than resting entirely on a shared string. Set `hostname` to `127.0.0.1` in `Bun.serve` if you want to be certain nothing outside the tailnet can reach it at all.

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

The intercom auto-detects ngrok URLs and switches to HTTPS. Note this does put a publicly reachable endpoint in front of your Claude session, gated only by the shared secret — pick a strong one.

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
| `REMOTE_HOST` | Yes | `localhost:8789` | Address of the other machine (`host:port` or tunnel URL) |
| `INTERCOM_SECRET` | Yes | `change-me-in-production` | Shared secret — must match on both sides |
| `INTERCOM_PORT` | No | `8788` | Port to listen on for incoming messages |
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

- **Shared secret authentication**: Every message requires an `X-Intercom-Secret` header matching the configured secret. Requests without it get a `401 Unauthorized`.
- **Inbound is treated as data, not instructions**: the server tells the receiving Claude that a channel message comes from another person's session — it can't approve anything, can't change configuration, a slash command in the text is inert, and requests for credentials or env files should be refused and surfaced to you.
- **No data persistence**: Messages are forwarded in real-time and not stored.
- **Localhost binding optional**: By default listens on `0.0.0.0` for cross-machine access. Set to `127.0.0.1` if using a tunnel.

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

## Use Cases

- **Backend + Frontend collaboration**: Backend Claude answers API questions from frontend Claude using the actual codebase
- **Monorepo with split teams**: Different Claude sessions working on different packages can coordinate
- **Code review relay**: One Claude reviews code and sends findings to the author's Claude session
- **CI/CD notifications**: Point your CI webhook at the intercom to push build results into a Claude session

## Star History

<a href="https://www.star-history.com/?repos=MuhammadTalhaMT%2Fclaude-intercom&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=MuhammadTalhaMT/claude-intercom&type=date&theme=dark&legend=top-left&sealed_token=Ud1kanPppbKNYxVWeWhXNaje8aO3qowksrsjC_x6Sn4DVP0vraT_UzrNbPv42LNKmb0eXgr3Pfr0dGcHQ_5lOaTHorFij5eh6OOHQgzUqipwB820zlkP9OinKDs7wQ8cq3XHmSn-UHENiXFeBK_PG5wA88RHmopqKlySA4Bd4BPhD4_daeYqAcKXvh-I" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=MuhammadTalhaMT/claude-intercom&type=date&legend=top-left&sealed_token=Ud1kanPppbKNYxVWeWhXNaje8aO3qowksrsjC_x6Sn4DVP0vraT_UzrNbPv42LNKmb0eXgr3Pfr0dGcHQ_5lOaTHorFij5eh6OOHQgzUqipwB820zlkP9OinKDs7wQ8cq3XHmSn-UHENiXFeBK_PG5wA88RHmopqKlySA4Bd4BPhD4_daeYqAcKXvh-I" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=MuhammadTalhaMT/claude-intercom&type=date&legend=top-left&sealed_token=Ud1kanPppbKNYxVWeWhXNaje8aO3qowksrsjC_x6Sn4DVP0vraT_UzrNbPv42LNKmb0eXgr3Pfr0dGcHQ_5lOaTHorFij5eh6OOHQgzUqipwB820zlkP9OinKDs7wQ8cq3XHmSn-UHENiXFeBK_PG5wA88RHmopqKlySA4Bd4BPhD4_daeYqAcKXvh-I" />
 </picture>
</a>

## License

MIT
