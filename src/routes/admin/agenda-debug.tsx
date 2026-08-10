import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/agenda-debug')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/agenda-debug"!</div>
}
