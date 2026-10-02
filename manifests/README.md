# LDAP Manager - plain Kubernetes manifests

`kubectl apply -k` deploys namespace `ldap-manager`, the ConfigMap holding `config.yml`,
two PersistentVolumeClaims, the Deployment, Service, ServiceAccount and an Ingress.

For anything beyond a quick start, use the Helm chart in [`../helm/ldap-manager`](../helm/ldap-manager):
it parameterises everything these files hard-code.

## Files

| File | Kind |
|---|---|
| `00-namespace.yaml` | Namespace `ldap-manager` |
| `01-serviceaccount.yaml` | ServiceAccount, no API token |
| `02-configmap.yaml` | `config.yml`, mounted read-only at `/etc/ldap-manager` |
| `03-secret.example.yaml` | Example Secret — **not** in `kustomization.yaml` |
| `04-pvc.yaml` | `ldap-manager-data` (`/app/.data`), `ldap-manager-secrets` (`/app/.secrets`) |
| `05-deployment.yaml` | Deployment |
| `06-service.yaml` | ClusterIP Service on port 8000 |
| `07-ingress.yaml` | Ingress with a placeholder host |
| `kustomization.yaml` | Pins the namespace and lists the resources |

## Install

Create the Secret **first** — the Deployment fails with `CreateContainerConfigError` until it
exists. Never put real passwords in a manifest:

```bash
kubectl create namespace ldap-manager

kubectl -n ldap-manager create secret generic ldap-manager-secrets \
  --from-literal=LDAP_MANAGER_CLUSTER_EXAMPLE_CLUSTER_PASSWORD='change-me' \
  --from-literal=LDAP_MANAGER_CONFIG_EXAMPLE_CLUSTER_PASSWORD='change-me' \
  --from-literal=LDAP_MANAGER_SECRET_KEY="$(openssl rand -hex 32)"
```

Edit `02-configmap.yaml` (or the live ConfigMap) so `host`, `bind_dn` and `base_dn` are your
directory's, and `07-ingress.yaml` so `host` is a name you control — then apply:

```bash
kubectl apply -k manifests
```

The cluster name in `config.yml` decides the environment variable that carries its bind
password (`LDAP_MANAGER_CLUSTER_EXAMPLE_CLUSTER_PASSWORD`): upper-cased, every run of
non-alphanumeric characters replaced by one `_`.

## Verify and reach it

```bash
kubectl -n ldap-manager rollout status deploy/ldap-manager
kubectl -n ldap-manager get pvc

kubectl -n ldap-manager port-forward svc/ldap-manager 8000:8000
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/health
# http://localhost:8000
```

## Update

```bash
# config.yml is re-read on every request; this takes effect without a restart.
kubectl -n ldap-manager edit configmap ldap-manager-config

# A new image:
kubectl -n ldap-manager set image deploy/ldap-manager ldap-manager=vibhuvioio/ldap-manager:<tag>
kubectl -n ldap-manager rollout status deploy/ldap-manager
```

## Uninstall

```bash
kubectl delete -k manifests

# Claims and the Secret survive, by design.
kubectl -n ldap-manager delete pvc ldap-manager-data ldap-manager-secrets
kubectl -n ldap-manager delete secret ldap-manager-secrets
kubectl delete namespace ldap-manager
```

Deleting `ldap-manager-secrets` (the PVC) invalidates cached bind passwords and any built-in
local accounts.

## Notes

- `05-deployment.yaml` probes `/api/auth/status`, not `/health`, because `/health` returns 503
  when a managed cluster is unreachable — probing it would take the only pod out of the
  Service during an LDAP outage.
- `/app/.cache` is an `emptyDir`; the encrypted password cache is rebuilt on demand.
- `05-deployment.yaml` sets `runAsUser`/`runAsGroup`/`fsGroup` to 1000. If your image tag runs
  as a different uid, change all three together or the app cannot write its 0600 files.
- To run more than one replica the two PVCs must be `ReadWriteMany` and the Secret must carry
  `LDAP_MANAGER_SECRET_KEY`, or every replica signs sessions the others reject.
