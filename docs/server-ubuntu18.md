# Ubuntu 18 Server Notes

This project uses modern dev tooling (ESLint 9, Stylelint 16) which requires newer Node.js versions.
If your server is pinned to Node 16, **avoid running the watch/dev scripts** on the server.

## Recommended (Node 16 compatible): build + static serve

```bash
npm ci
npm run build
npm run serve
```

Or use the convenience script:

```bash
npm run start:static
```

## If you must watch on Node 16

Stylelint may crash on Node 16. Use the `:nolint` watchers:

```bash
npm run watch-css:nolint
npm run watch-js:nolint
```

## ENOSPC (file watcher limit)

If you see `ENOSPC: System limit for number of file watchers reached`, increase the inotify limits:

```bash
sudo sh -c 'cat >/etc/sysctl.d/99-inotify.conf <<EOF
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=1024
EOF'
sudo sysctl --system
```

