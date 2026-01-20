import { Card, CardContent, CardHeader } from './ui/card'

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg animate-pulse">
          <div className="h-4 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-4 bg-muted rounded w-1/5"></div>
          <div className="flex-1"></div>
          <div className="h-8 bg-muted rounded w-20"></div>
        </div>
      ))}
    </div>
  )
}

export function ClusterCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-muted rounded-xl"></div>
            <div className="space-y-2">
              <div className="h-6 bg-muted rounded w-32"></div>
              <div className="h-4 bg-muted rounded w-48"></div>
            </div>
          </div>
          <div className="h-10 bg-muted rounded w-32"></div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-10 bg-muted rounded"></div>
      </CardContent>
    </Card>
  )
}

export function FormSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-24"></div>
        <div className="h-10 bg-muted rounded"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-32"></div>
        <div className="h-10 bg-muted rounded"></div>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-28"></div>
        <div className="h-10 bg-muted rounded"></div>
      </div>
      <div className="flex justify-end space-x-2 pt-4">
        <div className="h-10 bg-muted rounded w-20"></div>
        <div className="h-10 bg-muted rounded w-24"></div>
      </div>
    </div>
  )
}
