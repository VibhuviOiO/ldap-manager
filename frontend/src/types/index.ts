export interface Cluster {
  name: string
  host?: string
  port: number
  nodes?: ClusterNode[]
  bind_dn: string
  base_dn: string
  readonly: boolean
  description: string
  user_creation_form?: UserCreationForm
  table_columns?: TableColumns
  password_policy?: PasswordPolicy
  /** Where the bind password comes from. Never contains the secret itself. */
  credential?: ClusterCredential
}

export type CredentialSource = 'env' | 'file' | 'config'

export interface ClusterCredential {
  source: CredentialSource
  available: boolean
  env_var?: string
  file?: string
  hint?: string
}

export interface ClusterNode {
  host: string
  port: number
  name: string
}

export interface UserCreationForm {
  base_ou: string
  object_classes: string[]
  fields: FormField[]
}

export interface FormField {
  name: string
  label: string
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'checkbox'
  required: boolean
  placeholder?: string
  default?: string | number | boolean
  auto_generate?: string
  readonly?: boolean
  options?: Array<string | SelectOption>
}

export interface SelectOption {
  value: string
  label: string
}

export interface TableColumns {
  users?: Column[]
  groups?: Column[]
  ous?: Column[]
  [key: string]: Column[] | undefined
}

export interface Column {
  name: string
  label: string
  default_visible: boolean
}

export interface PasswordPolicy {
  min_length: number
  require_confirmation: boolean
}

export interface LDAPEntry {
  dn: string
  [key: string]: string | string[] | undefined
}

export interface SearchParams {
  cluster: string
  page: number
  page_size: number
  filter_type?: string
  search?: string
}

export interface SearchResult {
  entries: LDAPEntry[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export interface ClusterStatus {
  name: string
  connected: boolean
  passwordCached: boolean
  stats?: {
    entries: number
    groups: number
    users: number
  }
}

export interface MonitoringData {
  status: 'healthy' | 'warning' | 'error'
  message?: string
  [key: string]: unknown
}

export interface GroupInfo {
  dn: string
  cn: string | string[]
  description?: string | string[]
  objectClass?: string[]
}

export interface UserGroupsResponse {
  user_dn: string
  groups: GroupInfo[]
}

export interface UpdateGroupMembershipResponse {
  status: 'success' | 'partial'
  user_dn: string
  errors?: string[]
}

export interface DITChild {
  dn: string
  rdn: string
  object_class: string[]
  is_user: boolean
  is_group: boolean
  is_ou: boolean
}

export interface DITChildren {
  base_dn: string
  children: DITChild[]
}

export interface SchemaDef {
  oid: string
  name: string
  sup: string
  syntax: string
  equality: string
  single_value: boolean
  definition: string
}

export interface SchemaEntry {
  dn: string
  name: string
  attribute_types: SchemaDef[]
  object_classes: SchemaDef[]
}

export interface SchemaResponse {
  cluster: string
  schemas: SchemaEntry[]
  counts: { schemas: number; attribute_types: number; object_classes: number }
}

export interface AciRule {
  index: number | null
  rule: string
  raw: string
}

export interface AciDatabase {
  dn: string
  database: string
  suffix: string
  kind: string
  access: AciRule[]
}

export interface AciResponse {
  cluster: string
  databases: AciDatabase[]
  rule_count: number
}
