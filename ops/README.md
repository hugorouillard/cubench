# Operations

Cubench shares one Ubuntu 26.04 VPS with other applications.

| File | Purpose |
| --- | --- |
| `bootstrap-server.sh` | Once per VPS: install shared tools, Caddy, and UFW. |
| `bootstrap.sh` | Once for Cubench: install its user, service, site, and backups. |
| `deploy.sh` | Activate a tagged release and roll back failed health checks. |
| `backup.sh` | Create, verify, compress, and rotate SQLite backups. |
| `Caddyfile` | Cubench site fragment; routes its domain only. |
| `cubench.service` | Run the API as the isolated `cubench` user. |
| `cubench-backup.*` | Run database backups daily. |

Initial setup:

```bash
sudo ./bootstrap-server.sh 22
sudo ./bootstrap.sh cubench.hugorouillard.dev /path/to/deploy-key.pub
```

Future applications add their own user, directories, services, and file under
`/etc/caddy/sites/`. They share only Caddy and public ports 80/443.
