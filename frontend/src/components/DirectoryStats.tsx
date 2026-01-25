import { useEffect, useState } from 'react'
import { Database, Users, FolderTree } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import axios from 'axios'

interface DirectoryStatsProps {
  clusterName: string
}

export default function DirectoryStats({ clusterName }: DirectoryStatsProps) {
  const [stats, setStats] = useState({ total: 0, users: 0, groups: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [clusterName])

  const loadStats = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/entries/stats`, {
        params: {
          cluster: clusterName
        }
      })
      setStats({
        total: res.data.total,
        users: res.data.users,
        groups: res.data.groups
      })
    } catch (err) {
      console.error('Failed to load stats', err)
    }
    setLoading(false)
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5 text-primary" />
            <span>Total Entries</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{loading ? '...' : stats.total}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-primary" />
            <span>Users</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{loading ? '...' : stats.users}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FolderTree className="h-5 w-5 text-primary" />
            <span>Groups</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{loading ? '...' : stats.groups}</p>
        </CardContent>
      </Card>
    </div>
  )
}
