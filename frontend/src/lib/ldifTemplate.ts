import type { UserCreationForm } from '@/types'

/** Where a generated draft is parked until the LDIF view picks it up. */
export const LDIF_DRAFT_KEY = 'ldap-manager:ldif-draft'

export interface LdifDraft {
  cluster: string
  body: string
}

/**
 * Build an LDIF "add" record from a cluster's user creation form.
 *
 * The point is to let someone skip the form and edit the record directly,
 * seeding it with the objectClasses and fields the directory actually expects
 * so the result is valid without having to know the schema by heart.
 */
export function buildUserLdifTemplate(form: UserCreationForm, uid = 'newuser'): string {
  const baseOu = form.base_ou || ''
  const dn = baseOu ? `uid=${uid},${baseOu}` : `uid=${uid}`

  const lines: string[] = [
    `dn: ${dn}`,
    'changetype: add',
    ...(form.object_classes ?? []).map((oc) => `objectClass: ${oc}`),
  ]

  const expand = (value: string) => String(value).replace(/\$\{uid\}/g, uid)

  lines.push(`uid: ${uid}`)

  for (const field of form.fields ?? []) {
    if (field.name === 'uid') continue

    // Auto-generated and not editable: show the value it would receive, commented.
    if (field.auto_generate && field.readonly) {
      lines.push(`# ${field.name}: ${field.auto_generate} (auto-generated)`)
      continue
    }
    if (field.auto_generate) {
      const template = field.auto_generate
      if (template.includes('${uid}')) {
        lines.push(`${field.name}: ${expand(template)}`)
        continue
      }
      if (template === 'days_since_epoch' || template === 'next_uid') {
        lines.push(`# ${field.name}: ${template} (auto-generated)`)
        continue
      }
    }

    if (field.type === 'password') {
      lines.push(`${field.name}: `)
      continue
    }

    const value = field.default === undefined || field.default === null ? '' : String(field.default)
    lines.push(`${field.name}: ${value}`)
  }

  return lines.join('\n') + '\n'
}
