# Configuration Examples

## Example 1: Minimal Configuration (Recommended for Beginners)

**No column configuration needed!** The UI automatically detects and shows common LDAP attributes.

```yaml
clusters:
  # Simple LDAP server - just basic connection info
  - name: "Production LDAP"
    host: "ldap.company.com"
    port: 389
    bind_dn: "cn=admin,dc=company,dc=com"
    base_dn: "dc=company,dc=com"
    description: "Main production LDAP server"
    readonly: false

  # Another cluster - still minimal
  - name: "Development LDAP"
    host: "ldap-dev.company.com"
    port: 389
    bind_dn: "cn=admin,dc=dev,dc=company,dc=com"
    base_dn: "dc=dev,dc=company,dc=com"
    description: "Development environment"
    readonly: false
```

**What you get automatically:**
- **Users table**: Username, Full Name, Email, Type
- **Groups table**: Group Name, Description, Members
- **OUs table**: OU Name, Description, DN
- Users can click "Columns" button to show/hide additional attributes

---

## Example 2: Custom Configuration (Advanced)

**Full control** over forms and columns for power users.

```yaml
clusters:
  - name: "Mahabharata LDAP"
    host: "ldap.vibhuvioio.com"
    port: 389
    bind_dn: "cn=Manager,dc=vibhuvioio,dc=com"
    base_dn: "dc=vibhuvioio,dc=com"
    description: "LDAP with custom Mahabharata schema"
    readonly: false
    
    # Custom user creation form
    user_creation_form:
      base_ou: "ou=People,dc=vibhuvioio,dc=com"
      object_classes:
        - inetOrgPerson
        - posixAccount
        - shadowAccount
        - MahabharataUser  # Custom objectClass
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
          auto_generate: "${uid}@vibhuvioio.com"
        - name: userPassword
          label: Password
          type: password
          required: true
        - name: uidNumber
          label: UID Number
          type: number
          required: true
          auto_generate: "next_uid"
          readonly: true
        - name: gidNumber
          label: Group ID
          type: number
          required: true
          default: 100
        - name: homeDirectory
          label: Home Directory
          type: text
          required: true
          auto_generate: "/home/${uid}"
        - name: loginShell
          label: Shell
          type: text
          required: true
          default: "/bin/bash"
        # Custom attributes
        - name: kingdom
          label: Kingdom
          type: text
          required: false
        - name: weapon
          label: Weapon
          type: text
          required: false
        - name: role
          label: Role
          type: text
          required: false
    
    # Custom table columns
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
        - name: role
          label: Role
          default_visible: true      # Custom attribute
        - name: kingdom
          label: Kingdom
          default_visible: true      # Custom attribute
        - name: weapon
          label: Weapon
          default_visible: false     # Custom attribute (hidden)
        - name: allegiance
          label: Allegiance
          default_visible: false     # Custom attribute (hidden)
        - name: uidNumber
          label: UID
          default_visible: false     # Technical field (hidden)
        - name: gidNumber
          label: GID
          default_visible: false     # Technical field (hidden)
        - name: homeDirectory
          label: Home Directory
          default_visible: false     # Technical field (hidden)
        - name: loginShell
          label: Shell
          default_visible: false     # Technical field (hidden)
        - name: objectClass
          label: Type
          default_visible: true
      groups:
        - name: cn
          label: Group Name
          default_visible: true
        - name: description
          label: Description
          default_visible: true
        - name: members
          label: Members
          default_visible: true
        - name: gidNumber
          label: GID
          default_visible: false
        - name: dn
          label: DN
          default_visible: false
      ous:
        - name: ou
          label: OU Name
          default_visible: true
        - name: description
          label: Description
          default_visible: true
        - name: dn
          label: DN
          default_visible: true
```

---

## Comparison

| Feature | Minimal Config | Custom Config |
|---------|---------------|---------------|
| **Setup Time** | 30 seconds | 5-10 minutes |
| **Lines of Code** | 7 lines | 100+ lines |
| **User Creation** | Not available | Custom form with auto-fill |
| **Table Columns** | Auto-detected | Fully customized |
| **Custom Attributes** | Auto-detected | Explicitly defined |
| **Best For** | Standard LDAP, beginners | Custom schemas, power users |

---

## Recommendation

### Start with Minimal Config

```yaml
clusters:
  - name: "My LDAP"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
```

### Add Custom Config Only If Needed

- **Add `user_creation_form`** if you want custom user creation
- **Add `table_columns`** if you want to control default column visibility
- **Leave it minimal** if standard LDAP is enough

---

## Real-World Example: Standard Corporate LDAP

```yaml
clusters:
  - name: "Corporate LDAP"
    host: "ldap.company.com"
    port: 389
    bind_dn: "cn=admin,dc=company,dc=com"
    base_dn: "dc=company,dc=com"
    description: "Main corporate directory"
    readonly: false
    
    # Optional: Only add if you want user creation
    user_creation_form:
      base_ou: "ou=People,dc=company,dc=com"
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
          auto_generate: "${uid}@company.com"
        - name: userPassword
          label: Password
          type: password
          required: true
    
    # Optional: Only add if you want custom column defaults
    # (Otherwise UI auto-detects and shows common attributes)
```

---

## Summary

✅ **Minimal config works great** - UI auto-detects columns  
✅ **Add custom config only when needed** - for special requirements  
✅ **Users can always customize** - via "Columns" button in UI  
✅ **Start simple, add complexity later** - incremental approach
