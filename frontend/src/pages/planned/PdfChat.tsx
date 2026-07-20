import ComingSoon from '../../components/ComingSoon'
export default function PdfChat() {
  return <ComingSoon
    title="PDF Chat"
    description="Open a single uploaded PDF and ask questions scoped only to that document."
    plannedFeatures={['Pick one document from your Library', 'Chat restricted to that document only', 'Inline PDF viewer alongside the chat']}
  />
}
