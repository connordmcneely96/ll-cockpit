import CadRunClient from './CadRunClient'

export default async function CadRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  return <CadRunClient runId={runId} />
}
