# User Creation Form Configuration

LDAP Manager supports **no-code form configuration** via YAML. Define custom user creation forms per cluster without writing any UI code.

## Configuration Location

Add `user_creation_form` section to any cluster in `config.yml`:

```yaml
clusters:
  - name: "my-cluster"
    host: "ldap.example.com"
    port: 389
    bind_dn: "cn=admin,dc=example,dc=com"
    base_dn: "dc=example,dc=com"
    user_creation_form:
      base_ou: "ou=People,dc=example,dc=com"
      object_classes: [inetOrgPerson, posixAccount, shadowAccount]
      fields: [...]
```

## Form Schema

### Top-Level Fields

- **base_ou**: Base DN where users will be created (e.g., `ou=People,dc=example,dc=com`)
- **object_classes**: Array of LDAP objectClasses to assign to new users
- **fields**: Array of form field definitions

### Field Definition

Each field supports:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | LDAP attribute name (e.g., `uid`, `cn`, `mail`) |
| `label` | string | Yes | Human-readable label shown in UI |
| `type` | string | Yes | Input type: `text`, `email`, `password`, `number`, `select` |
| `required` | boolean | Yes | Whether field is required |
| `placeholder` | string | No | Placeholder text |
| `default` | any | No | Default value |
| `auto_generate` | string | No | Auto-generation rule (see below) |
| `readonly` | boolean | No | Make field read-only |
| `options` | string[] | No | Dropdown options (only for `type: select`) |

## Auto-Generation Rules

### Built-in Generators

1. **next_uid** - Auto-generates next available UID number starting at 2000
   ```yaml
   - name: uidNumber
     auto_generate: "next_uid"
     readonly: true
   ```

2. **days_since_epoch** - Calculates days since 1970-01-01 (for shadowLastChange)
   ```yaml
   - name: shadowLastChange
     auto_generate: "days_since_epoch"
     readonly: true
   ```

3. **Template Strings** - Use `${uid}` to reference username
   ```yaml
   - name: mail
     auto_generate: "${uid}@example.com"
   
   - name: homeDirectory
     auto_generate: "/home/${uid}"
   ```

## Complete Example

```yaml
user_creation_form:
  base_ou: "ou=People,dc=vibhuvioio,dc=com"
  object_classes:
    - inetOrgPerson
    - posixAccount
    - top
    - shadowAccount
  fields:
    - name: uid
      label: Username
      type: text
      required: true
      placeholder: "e.g., jdoe"
    
    - name: cn
      label: First Name
      type: text
      required: true
    
    - name: sn
      label: Last Name
      type: text
      required: true
    
    - name: mail
      label: Email
      type: email
      required: true
      auto_generate: "${uid}@algonomy.com"
    
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
      label: Primary Group ID
      type: number
      required: true
      default: 100
    
    - name: homeDirectory
      label: Home Directory
      type: text
      required: true
      auto_generate: "/home/${uid}"
    
    - name: loginShell
      label: Login Shell
      type: text
      required: true
      default: "/bin/bash"
```

## Benefits

- **No Code**: Define forms entirely in YAML
- **Per-Cluster**: Different forms for different LDAP environments
- **Flexible**: Support any LDAP schema and custom attributes
- **Auto-Generation**: Smart defaults reduce manual input
- **Validation**: Built-in required field validation

## Custom Schemas

To support custom LDAP schemas (e.g., custom objectClasses with additional attributes):

1. Add custom objectClass to `object_classes` array
2. Add custom attributes as fields
3. UI will automatically render them

Example with custom schema:
```yaml
object_classes:
  - inetOrgPerson
  - posixAccount
  - MahabharataUser  # Custom objectClass
fields:
  # ... standard fields ...
  - name: kingdom
    label: Kingdom
    type: text
    required: false
  - name: weapon
    label: Weapon
    type: text
    required: false
```


## Dropdown Fields (Select)

Use `type: select` with `options` array for predefined choices:

```yaml
fields:
  - name: role
    label: Role
    type: select
    required: false
    options:
      - Warrior
      - King
      - Advisor
      - Teacher
  
  - name: kingdom
    label: Kingdom
    type: select
    required: true
    options:
      - Hastinapura
      - Anga
      - Dwaraka
  
  - name: allegiance
    label: Allegiance
    type: select
    required: false
    options:
      - Pandavas
      - Kauravas
```

### When to Use Dropdowns

✅ **Use `select` for:**
- Fixed set of values (roles, departments, locations)
- Standardized choices (status, priority, category)
- Prevents typos and ensures consistency

❌ **Use `text` for:**
- Free-form input (names, descriptions)
- Unique values (usernames, emails)
- Values that can't be predefined

### Example: Mixed Form

```yaml
fields:
  # Text input
  - name: uid
    label: Username
    type: text
    required: true
  
  # Dropdown
  - name: department
    label: Department
    type: select
    required: true
    options:
      - Engineering
      - Sales
      - Marketing
      - HR
  
  # Text input with placeholder
  - name: weapon
    label: Weapon
    type: text
    required: false
    placeholder: "e.g., Sword, Bow, Mace"
  
  # Dropdown
  - name: location
    label: Office Location
    type: select
    required: true
    options:
      - New York
      - San Francisco
      - London
      - Tokyo
```
