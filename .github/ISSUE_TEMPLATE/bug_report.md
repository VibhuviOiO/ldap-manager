---
name: Bug report
about: Something in LDAP Manager does not work as documented
title: ''
labels: bug
assignees: ''
---

<!--
The LDAP server version and the image tag decide most answers. A report
without them usually cannot be reproduced.
-->

**What happened**

**What you expected**

**Steps to reproduce**
1.
2.

## Your setup

| | |
| --- | --- |
| LDAP Manager version | `docker run --rm --entrypoint sh vibhuvioio/ldap-manager:<tag> -c 'cat /app/VERSION 2>/dev/null'` or the chart version |
| Install method | Docker run / Docker Compose / Helm chart |
| LDAP server and version | e.g. OpenLDAP 2.6.10, or `slapd -VV` |
| `auth.mode` | `none` / `local` / `ldap` |
| TLS | none / LDAPS / StartTLS |

**Relevant logs**

```
# docker logs <container> 2>&1 | tail -50
```

**Anything else**

<!--
If a feature is missing from the UI - monitoring, topology, the change log -
check Settings first. The app detects optional server features and shows the
enablement steps there rather than failing. See
https://vibhuvioio.com/ldap-manager/compatibility/
-->
