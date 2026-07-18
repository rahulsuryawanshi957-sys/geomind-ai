import ComingSoon from '../../components/ComingSoon'
export default function LabReports() {
  return <ComingSoon
    title="Laboratory Reports"
    description="Upload lab reports and have the AI extract and interpret key parameters automatically."
    plannedFeatures={['Atterberg Limits extraction', 'Grain size distribution', 'Specific gravity, CBR, Triaxial, UCS', 'Consolidation test parameters', 'Automatic engineering interpretation']}
  />
}
