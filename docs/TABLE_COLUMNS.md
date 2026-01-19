# Table Column Configuration Guide

## What is this?

The `table_columns` section in `config.yml` lets you control which columns appear in the Users, Groups, and OUs tables.

## Quick Start

By default, the table shows only the most important columns. Users can click the **"Columns"** button (⚙️ icon) to show/hide additional columns.

## Example Configuration

```yaml
table_columns:
  users:
    - name: uid              # The LDAP attribute name
      label: Username        # What users see in the table header
      default_visible: true  # Show this column by default (true/false)
    
    - name: mail
      label: Email
      default_visible: true  # Visible by default
    
    - name: uidNumber
      label: UID
      default_visible: false # Hidden by default, users can enable it
```

## Common Columns for Users Table

| Attribute | Label | Recommended Default | Description |
|-----------|-------|---------------------|-------------|
| `uid` | Username | ✅ true | Login username |
| `cn` | Full Name | ✅ true | User's full name |
| `mail` | Email | ✅ true | Email address |
| `uidNumber` | UID | ❌ false | Unix user ID number (technical) |
| `gidNumber` | GID | ❌ false | Unix group ID number (technical) |
| `homeDirectory` | Home Directory | ❌ false | Home folder path (technical) |
| `loginShell` | Shell | ❌ false | Login shell (technical) |
| `objectClass` | Type | ✅ true | User type badge |

## Common Columns for Groups Table

| Attribute | Label | Recommended Default | Description |
|-----------|-------|---------------------|-------------|
| `cn` | Group Name | ✅ true | Name of the group |
| `description` | Description | ✅ true | Group description |
| `gidNumber` | GID | ❌ false | Unix group ID (technical) |
| `members` | Members | ✅ true | Member count |
| `dn` | DN | ❌ false | Full LDAP path (technical) |

## How Users Interact With This

1. **Default View**: Users see only columns marked `default_visible: true`
2. **Customize**: Click the "Columns" button (⚙️) to show/hide columns
3. **Saved**: Their preferences are saved in their browser
4. **Per-Cluster**: Each LDAP cluster can have different column settings

## Best Practices

### ✅ Show by Default
- Username, Name, Email (essential info)
- Type/Status badges
- Member counts for groups

### ❌ Hide by Default
- Technical Unix fields (UID, GID, paths)
- Full DNs (too long and technical)
- Internal LDAP attributes

## Why Hide Technical Columns?

Most users don't need to see:
- **uidNumber/gidNumber**: Unix system IDs (only needed by sysadmins)
- **homeDirectory**: File paths (only relevant for shell access)
- **loginShell**: Technical Unix setting
- **DN**: Full LDAP path (too verbose)

Power users can enable these via the Columns button when needed.

## No Configuration Needed?

If you don't add `table_columns` to your cluster config, the UI will show a simple default view with:
- Users: Username, Full Name, Email, Type
- Groups: Group Name, Description, Members
- OUs: OU Name, Description, DN

## Example: Minimal Config

```yaml
clusters:
  - name: "my-ldap"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
    # No table_columns needed - uses smart defaults!
```

## Example: Custom Config

```yaml
clusters:
  - name: "my-ldap"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
    table_columns:
      users:
        - name: uid
          label: Username
          default_visible: true
        - name: cn
          label: Full Name
          default_visible: true
        - name: mail
          label: Email
          default_visible: true
        - name: uidNumber
          label: UID Number
          default_visible: false  # Hidden, but users can enable it
```

## Summary

- **Simple**: Just list the columns you want available
- **Smart Defaults**: Hide technical fields by default
- **User Control**: Users can show/hide columns via Settings button
- **Optional**: Works great without any configuration
