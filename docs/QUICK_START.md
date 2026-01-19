# Quick Start Guide

## For End Users (No Configuration Needed)

### Viewing LDAP Data

1. **Open LDAP Manager** in your browser
2. **Click on a cluster** to view its data
3. **Navigate tabs**: Users | Groups | OUs | All | Monitoring | Activity
4. **Search**: Type in the search box to filter entries
5. **Customize columns**: Click the "Columns" button (⚙️) to show/hide columns

### Column Visibility

By default, you see the most important columns:
- **Users**: Username, Full Name, Email, Type
- **Groups**: Group Name, Description, Members
- **OUs**: OU Name, Description, DN

**To see more columns** (like UID, GID, Home Directory):
1. Click the **"Columns"** button (⚙️ icon) next to the search box
2. Check the boxes for columns you want to see
3. Your preferences are saved automatically in your browser

### Creating Users

If you have write access:
1. Go to the **Users** tab
2. Click **"Create User"** button
3. Fill in the form (some fields auto-fill)
4. Click **"Create User"**

---

## For Administrators (Configuration)

### Minimal Setup

Create `config.yml` with just the basics:

```yaml
clusters:
  - name: "My LDAP Server"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
```

That's it! The UI will use smart defaults.

### Optional: Customize User Creation Form

Add this to define which fields appear when creating users:

```yaml
    user_creation_form:
      base_ou: "ou=People,dc=example,dc=com"
      object_classes: [inetOrgPerson, posixAccount]
      fields:
        - name: uid
          label: Username
          type: text
          required: true
        - name: cn
          label: Full Name
          type: text
          required: true
        - name: mail
          label: Email
          type: email
          required: true
          auto_generate: "${uid}@example.com"  # Auto-fills based on username
```

See [USER_CREATION_FORM.md](USER_CREATION_FORM.md) for details.

### Optional: Customize Table Columns

Add this to control which columns are available:

```yaml
    table_columns:
      users:
        - name: uid
          label: Username
          default_visible: true    # Show by default
        - name: uidNumber
          label: UID
          default_visible: false   # Hidden, but users can enable it
```

See [TABLE_COLUMNS.md](TABLE_COLUMNS.md) for details.

---

## Key Concepts

### What is "default_visible"?

- `true` = Column shows by default
- `false` = Column is hidden but users can enable it via Settings

**Best Practice**: Hide technical fields (UID, GID, paths) by default. Show user-friendly fields (name, email).

### What is "auto_generate"?

Automatically fills in form fields:
- `"${uid}@example.com"` → Replaces `${uid}` with username
- `"next_uid"` → Auto-generates next available UID number
- `"/home/${uid}"` → Creates home directory path

### What is "readonly"?

- `readonly: true` in cluster config = No create/edit/delete operations
- `readonly: false` = Full write access (shows "Create User" button)

---

## Documentation

- **[USER_CREATION_FORM.md](USER_CREATION_FORM.md)** - Customize user creation forms
- **[TABLE_COLUMNS.md](TABLE_COLUMNS.md)** - Customize table columns
- **[config.example.yml](../config.example.yml)** - Full configuration example

---

## Summary

**For Users**: Just use the UI, click "Columns" to customize view

**For Admins**: Minimal config works great, customize only if needed
