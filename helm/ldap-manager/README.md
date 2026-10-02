# ldap-manager

Runs [`vibhuvioio/ldap-manager`](https://hub.docker.com/r/vibhuvioio/ldap-manager) on Kubernetes:
one Deployment serving the React UI and the FastAPI backend on port 8000, with
`config.yml` from a ConfigMap, bind passwords from a Secret, and PersistentVolumeClaims
for the two directories the app cannot rebuild.

- `appVersion` is the LDAP Manager release; the chart version is independent.
- The app is stateless apart from `/app/.data` and `/app/.secrets`, so a restart is free.
- `config.yml` is mounted as a directory and read through `LDAP_MANAGER_CONFIG`, so editing
  the ConfigMap takes effect without a restart.

## Requirements

| | |
|---|---|
| Kubernetes | >= 1.24 |
| Helm | 3 |
| Storage | a default StorageClass (or set `persistence.*.storageClass`) |

## Install

```bash
kubectl create namespace directory

# Bind passwords and, if you plan to scale out, the session signing key.
# Every key becomes an environment variable in the pod (envFrom), so a cluster
# whose config.yml says `credential: {source: env}` picks its password up by name:
#   cluster "example-cluster" -> LDAP_MANAGER_CLUSTER_EXAMPLE_CLUSTER_PASSWORD
kubectl -n directory create secret generic ldap-manager-secrets \
  --from-literal=LDAP_MANAGER_CLUSTER_EXAMPLE_CLUSTER_PASSWORD='change-me' \
  --from-literal=LDAP_MANAGER_CONFIG_EXAMPLE_CLUSTER_PASSWORD='change-me' \
  --from-literal=LDAP_MANAGER_SECRET_KEY="$(openssl rand -hex 32)"

helm install ldap-manager ./helm/ldap-manager \
  --namespace directory \
  --set secrets.existingSecret=ldap-manager-secrets
```

The chart renders a ConfigMap with no clusters by default. Add yours:

```bash
helm upgrade ldap-manager ./helm/ldap-manager -n directory \
  --reuse-values \
  --set config.clusters[0].name=example-cluster \
  --set config.clusters[0].host=ldap.example.com \
  --set config.clusters[0].bind_dn=cn=admin,dc=example,dc=com \
  --set config.clusters[0].base_dn=dc=example,dc=com \
  --set config.clusters[0].credential.source=env
```

or keep the cluster list in a values file, which is easier to read:

```yaml
# my-values.yaml
secrets:
  existingSecret: ldap-manager-secrets
config:
  auth:
    mode: none
    defaultRole: readonly
  clusters:
    - name: example-cluster
      host: ldap.example.com
      port: 389
      bind_dn: cn=admin,dc=example,dc=com
      base_dn: dc=example,dc=com
      credential:
        source: env
```

```bash
helm upgrade --install ldap-manager ./helm/ldap-manager -n directory -f my-values.yaml
```

Verify and reach it:

```bash
kubectl -n directory rollout status deploy/ldap-manager
kubectl -n directory port-forward svc/ldap-manager 8000:8000
# http://localhost:8000
```

## Configure

`config.yml` is built from `config.auth`, `config.clusters` and `config.extra`. The cluster
entries are rendered verbatim, so their keys are the `config.yml` schema from the app's
[`config.example.yml`](https://github.com/VibhuviOiO/ldap-manager/blob/main/config.example.yml):
`name`, `host` or `nodes`, `port`, `bind_dn`, `base_dn`, `readonly`, `description`,
`credential`, `tls`, `config`, `user_creation_form`. Nothing is invented for you — every
host and DN in an example is a placeholder.

Credential sources, per cluster: `env` (default), `file`, `config`. LDAP Manager never
stores a password. Use `env` or `file` in Kubernetes; `config` writes the password into
the ConfigMap.

The image's built-in config location is `/app/config.yml`. This chart mounts the ConfigMap as
a directory at `config.mountPath` (default `/etc/ldap-manager`) and sets
`LDAP_MANAGER_CONFIG` to the file inside it, rather than bind-mounting a single file. The
reason is that a Kubernetes `subPath` file mount never sees ConfigMap updates, while the app
re-reads `config.yml` on every request — a directory mount is what makes
`kubectl edit configmap` take effect without a restart.

`contextPath` must match the path your ingress serves. With `contextPath: /ldap-manager`,
route `/ldap-manager` and keep the nginx rewrite rule consistent with it.

### State

| Path | Contents | Volume |
|---|---|---|
| `/app/.data` | audit log | `persistence.data` claim |
| `/app/.secrets` | local-user encryption key and session signing key | `persistence.secrets` claim |
| `/app/.cache` | unused; retained for compatibility | `emptyDir` unless `persistence.cache.enabled` |

`config.yml` stays operator-owned: the app never writes to it.

## Health and probes

| Endpoint | Meaning |
|---|---|
| `/api/auth/status` | 200 whenever the process is serving. App-local. |
| `/health` | 200 only when `config.yml` parses *and* the checked cluster answers; 503 when a managed directory is down. |

All three probes default to `/api/auth/status` on purpose. With one replica, readiness on
`/health` removes the only pod from the Service during an LDAP outage — the moment you most
want the UI. Point `probes.readiness.path` at `/health` only when you run more than one
replica and want traffic gated on directory health.

## More than one replica

The two state directories are `ReadWriteOnce` by default, and sessions are HMAC-signed with
a key in `/app/.secrets`. The chart refuses to render `replicaCount > 1` unless the state is
genuinely shared:

- `persistence.data.accessModes` and `persistence.secrets.accessModes` set to
  `ReadWriteMany` with a StorageClass that supports it, **or** `existingClaim` pointing at an
  RWX-backed claim, and
- `LDAP_MANAGER_SECRET_KEY` set (via `secrets.existingSecret` or `secrets.env`), or the
  shared `/app/.secrets` volume carrying `session.key`.

## Upgrade

```bash
helm upgrade ldap-manager ./helm/ldap-manager -n directory -f my-values.yaml
kubectl -n directory rollout status deploy/ldap-manager
```

The deployment rolls with `maxSurge: 0`, so the old pod releases its `ReadWriteOnce` volumes
before the new one starts. Bind passwords are never regenerated by the chart.

## Uninstall

```bash
helm uninstall ldap-manager -n directory
```

PersistentVolumeClaims and the Secret are **not** deleted — Helm never garbage-collects a
claim it created, and that is what keeps `/app/.secrets` intact across a reinstall. Remove
them explicitly when you are done:

```bash
kubectl -n directory delete pvc ldap-manager-data ldap-manager-secrets
kubectl -n directory delete secret ldap-manager-secrets
```

Deleting the PVC holding `/app/.secrets` invalidates cached bind passwords and any built-in
local accounts.

## Values

### Image and identity

| Key | Default | Description |
|---|---|---|
| `replicaCount` | `1` | Pods. See [More than one replica](#more-than-one-replica). |
| `image.repository` | `vibhuvioio/ldap-manager` | Image repository. |
| `image.tag` | `""` | Tag. Empty means `.Chart.AppVersion`. |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy. |
| `imagePullSecrets` | `[]` | Pull secrets. |
| `nameOverride` | `""` | Override the chart name. |
| `fullnameOverride` | `""` | Override the generated name. |
| `serviceAccount.create` | `true` | Create a ServiceAccount. |
| `serviceAccount.name` | `""` | Name; defaults to the fullname. |
| `serviceAccount.annotations` | `{}` | ServiceAccount annotations. |

### Application

| Key | Default | Description |
|---|---|---|
| `contextPath` | `""` | Sub-path the app is served under, e.g. `/ldap-manager`. |
| `allowedOrigins` | `""` | Comma-separated CORS origins. Set it in production; never `*`. |
| `logLevel` | `INFO` | `LOG_LEVEL`. |
| `jsonLogs` | `true` | `JSON_LOGS`. |
| `extraEnv` | `[]` | Extra env vars. |
| `extraEnvFrom` | `[]` | Extra `envFrom` sources. |

### config.yml

| Key | Default | Description |
|---|---|---|
| `config.existingConfigMap` | `""` | Use your own ConfigMap instead of a rendered one. |
| `config.key` | `config.yml` | Key inside the ConfigMap. |
| `config.mountPath` | `/etc/ldap-manager` | Directory the ConfigMap is mounted at, read-only. |
| `config.content` | `""` | Verbatim `config.yml`, rendered through `tpl`. Overrides the structured values. |
| `config.auth.mode` | `none` | `none`, `local` or `ldap`. |
| `config.auth.defaultRole` | `readonly` | `readonly`, `readwrite` or `admin`. |
| `config.auth.sessionLifetimeHours` | `12` | Session lifetime. |
| `config.auth.ldap` | `{}` | Free-form `auth.ldap` block for `mode: ldap`. |
| `config.clusters` | `[]` | Cluster entries, verbatim `config.yml` schema. |
| `config.extra` | `""` | Extra YAML appended to the rendered file. |

### Secrets

| Key | Default | Description |
|---|---|---|
| `secrets.existingSecret` | `""` | Existing Secret consumed with `envFrom`. Recommended. |
| `secrets.create` | `false` | Render a Secret from `secrets.env` when no existing one is set. |
| `secrets.env` | `{}` | Keys for the chart-managed Secret. |
| `secrets.mountPath` | `""` | Also mount the Secret read-only here, for `credential.source: file`. |

### Persistence

| Key | Default | Description |
|---|---|---|
| `persistence.data.enabled` | `true` | Claim for `/app/.data`; false uses an `emptyDir`. |
| `persistence.data.existingClaim` | `""` | Claim to reuse. |
| `persistence.data.size` | `1Gi` | Requested size. |
| `persistence.data.accessModes` | `["ReadWriteOnce"]` | Access modes. |
| `persistence.data.storageClass` | `""` | StorageClass; empty uses the default. |
| `persistence.data.annotations` | `{}` | Claim annotations. |
| `persistence.secrets.*` | same shape as `data` | Claim for `/app/.secrets`. |
| `persistence.cache.enabled` | `false` | Persist `/app/.cache`; false uses an `emptyDir`. |
| `persistence.cache.*` | same shape as `data` | Claim for `/app/.cache`. |

### Networking

| Key | Default | Description |
|---|---|---|
| `service.type` | `ClusterIP` | Service type. |
| `service.port` | `8000` | Service port. |
| `service.annotations` | `{}` | Service annotations. |
| `ingress.enabled` | `false` | Create an Ingress. |
| `ingress.className` | `""` | `ingressClassName`. |
| `ingress.annotations` | `{}` | Ingress annotations. |
| `ingress.hosts` | `[]` | `host` plus `paths` (`path`, `pathType`). |
| `ingress.tls` | `[]` | Standard Ingress TLS blocks. |

### Probes, rollout and security

| Key | Default | Description |
|---|---|---|
| `probes.startup.enabled` | `true` | Startup probe. |
| `probes.startup.path` | `/api/auth/status` | See [Health and probes](#health-and-probes). |
| `probes.startup.failureThreshold` | `30` | Startup probe threshold. |
| `probes.startup.periodSeconds` | `5` | Startup probe period. |
| `probes.readiness.path` | `/api/auth/status` | Set to `/health` to gate traffic on directory health. |
| `probes.liveness.path` | `/api/auth/status` | Liveness path. |
| `probes.readiness.*` | `initialDelaySeconds 5`, `periodSeconds 10`, `timeoutSeconds 5`, `failureThreshold 3` | Readiness tuning. |
| `probes.liveness.*` | `initialDelaySeconds 20`, `periodSeconds 30`, `timeoutSeconds 5`, `failureThreshold 3` | Liveness tuning. |
| `deploymentStrategy` | `RollingUpdate`, `maxSurge 0`, `maxUnavailable 1` | Keeps `ReadWriteOnce` volumes exclusive. |
| `terminationGracePeriodSeconds` | `30` | Grace period. |
| `podSecurityContext` | `runAsNonRoot`, `runAsUser/Group 1000`, `fsGroup 1000`, `RuntimeDefault` | Match the uid the image runs as. |
| `securityContext` | no escalation, all capabilities dropped, `readOnlyRootFilesystem: false` | Container security. |
| `resources` | requests `250m`/`256Mi`, limits `1`/`1Gi` | Resources. |
| `extraVolumes` / `extraVolumeMounts` | `[]` | E.g. cluster CA certificates for `tls.ca_file`. |
| `podAnnotations` / `podLabels` | `{}` | Pod metadata. |
| `nodeSelector` / `tolerations` / `affinity` / `topologySpreadConstraints` | empty | Scheduling. |
| `podDisruptionBudget.enabled` | `true` | Created only when `replicaCount > 1`. |
| `podDisruptionBudget.maxUnavailable` | `1` | Disruption budget. |

## Troubleshooting

```bash
kubectl -n directory logs deploy/ldap-manager
kubectl -n directory get events --sort-by=.lastTimestamp
```

| Symptom | Cause |
|---|---|
| Pod stuck `CreateContainerConfigError` | Secret `secrets.existingSecret` does not exist in this namespace. |
| UI shows no clusters | `config.clusters` is empty, or the ConfigMap key is not `config.yml`. |
| "expects its password in $LDAP_MANAGER_…" in the logs | The Secret has no key for that cluster name; remember the name is upper-cased with non-alphanumeric runs collapsed to `_`. |
| `container has runAsNonRoot and image will run as root` | The image tag runs as a different uid; set `podSecurityContext.runAsUser/runAsGroup/fsGroup` together. |
| Permission denied writing `/app/.data` | `fsGroup` does not match the uid the process runs as. |
| ConfigMap edit does not take effect | Something mounted the key with `subPath`; this chart mounts the directory instead. |
