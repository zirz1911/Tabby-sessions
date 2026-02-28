# Tabby-sessions

A Tabby Terminal plugin that adds tmux-like session persistence on Windows.

## Architecture

```
tabby-session-daemon    ← Background Node.js process (PTY manager)
tabby-session-plugin    ← Tabby Angular plugin (UI + IPC client)
```

## How it works

1. **Daemon** runs as a background process, managing PTY sessions via `node-pty`
2. **Plugin** connects to daemon via Windows Named Pipe (`\\.\pipe\tabby-daemon`)
3. Sessions persist after Tabby closes — reconnect on next open

## Status

> Work in progress — Windows native first

## References

- [Tabby Terminal](https://github.com/Eugeny/tabby)
- [Tabby Plugin API](https://github.com/Eugeny/tabby/tree/master/tabby-core)
