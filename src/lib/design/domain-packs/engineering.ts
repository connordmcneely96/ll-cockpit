export interface DomainBlock {
  slug: string
  name: string
  category: string
  description: string
  render_strategy: 'template'
  template_html: string
  schema_json: string
  default_props_json: string
}

export const engineeringPack: DomainBlock[] = [
  {
    slug: 'fmea-worksheet',
    name: 'FMEA Worksheet',
    category: 'Engineering',
    description: 'Failure Mode & Effects Analysis table — severity, occurrence, detection, RPN, and Action Priority columns.',
    render_strategy: 'template',
    template_html: `<section id="fmea-worksheet" class="py-16 px-6 bg-surface">
  <div class="max-w-7xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-1">
      <h2 class="text-2xl font-display font-bold text-text-primary">Failure Mode &amp; Effects Analysis</h2>
      <span class="text-sm text-text-secondary font-mono">FMEA-2024-001 · Rev A · PFMEA</span>
    </div>
    <p class="text-sm text-text-secondary mb-6">Process: Check valve assembly — spring-assisted piston</p>
    <div class="overflow-x-auto border border-border rounded-lg">
      <table class="w-full text-xs" style="min-width:880px">
        <thead>
          <tr class="border-b-2 border-border text-left bg-surface">
            <th class="p-2 font-medium">Item / Function</th>
            <th class="p-2 font-medium">Potential Failure Mode</th>
            <th class="p-2 font-medium">Potential Effect(s)</th>
            <th class="p-2 font-medium text-center">SEV</th>
            <th class="p-2 font-medium">Potential Cause(s)</th>
            <th class="p-2 font-medium text-center">OCC</th>
            <th class="p-2 font-medium">Current Controls</th>
            <th class="p-2 font-medium text-center">DET</th>
            <th class="p-2 font-medium text-center">RPN</th>
            <th class="p-2 font-medium text-center">AP</th>
            <th class="p-2 font-medium">Recommended Action</th>
          </tr>
        </thead>
        <tbody class="text-text-secondary">
          <tr class="border-b border-border">
            <td class="p-2">Disc / sealing</td><td class="p-2">Fails to seat — backflow</td><td class="p-2">Reverse flow, water hammer downstream</td>
            <td class="p-2 text-center font-medium text-text-primary">8</td><td class="p-2">Spring fatigue, debris on seat</td><td class="p-2 text-center">4</td>
            <td class="p-2">Seat leak test per API 598</td><td class="p-2 text-center">3</td>
            <td class="p-2 text-center font-medium text-text-primary">96</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-white">H</span></td>
            <td class="p-2">Upgrade spring matl; 100% seat inspection</td>
          </tr>
          <tr class="border-b border-border">
            <td class="p-2">Body / pressure boundary</td><td class="p-2">Through-wall leak</td><td class="p-2">Loss of containment, safety hazard</td>
            <td class="p-2 text-center font-medium text-text-primary">9</td><td class="p-2">Casting porosity</td><td class="p-2 text-center">2</td>
            <td class="p-2">Hydrostatic shell test, RT of castings</td><td class="p-2 text-center">2</td>
            <td class="p-2 text-center font-medium text-text-primary">36</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs border border-border text-text-primary">M</span></td>
            <td class="p-2">Maintain RT sampling plan</td>
          </tr>
          <tr>
            <td class="p-2">Hinge pin</td><td class="p-2">Galling / seizure</td><td class="p-2">Disc sticks open or closed</td>
            <td class="p-2 text-center font-medium text-text-primary">6</td><td class="p-2">Inadequate hardness, corrosion</td><td class="p-2 text-center">3</td>
            <td class="p-2">Material cert review, cycle test</td><td class="p-2 text-center">4</td>
            <td class="p-2 text-center font-medium text-text-primary">72</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs border border-border text-text-primary">M</span></td>
            <td class="p-2">Specify hardened Stellite pin</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-text-secondary mt-3">RPN = SEV × OCC × DET (1–1000). AP = Action Priority (H/M/L) per AIAG-VDA 2019.</p>
  </div>
</section>`,
    schema_json: '{"settings":[{"type":"text","id":"heading","label":"Heading","default":"Failure Mode & Effects Analysis"},{"type":"text","id":"process","label":"Process / Item","default":""}],"blocks":[{"type":"failure-row","name":"Failure Mode Row","limit":20,"settings":[{"type":"text","id":"item","label":"Item / Function"},{"type":"text","id":"mode","label":"Failure Mode"},{"type":"text","id":"effect","label":"Effect"},{"type":"text","id":"sev","label":"Severity (1-10)"},{"type":"text","id":"cause","label":"Cause"},{"type":"text","id":"occ","label":"Occurrence (1-10)"},{"type":"text","id":"controls","label":"Current Controls"},{"type":"text","id":"det","label":"Detection (1-10)"},{"type":"text","id":"action","label":"Recommended Action"}]}]}',
    default_props_json: '{"heading":"Failure Mode & Effects Analysis"}',
  },
  {
    slug: 'spec-sheet',
    name: 'Spec Sheet',
    category: 'Engineering',
    description: 'Technical datasheet table — parameters, values, units, and standard/reference citations.',
    render_strategy: 'template',
    template_html: `<section id="spec-sheet" class="py-16 px-6 bg-surface">
  <div class="max-w-4xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-4">
      <h2 class="text-2xl font-display font-bold text-text-primary">Technical Specifications</h2>
      <span class="text-sm text-text-secondary font-mono">Model CV-300 · Spring-Assisted Check Valve</span>
    </div>
    <div class="border border-border rounded-lg overflow-hidden">
      <table class="w-full text-sm" style="table-layout:fixed">
        <thead>
          <tr class="border-b-2 border-border text-left">
            <th class="p-3 font-medium" style="width:34%">Parameter</th>
            <th class="p-3 font-medium" style="width:30%">Value</th>
            <th class="p-3 font-medium" style="width:14%">Unit</th>
            <th class="p-3 font-medium" style="width:22%">Standard / Ref.</th>
          </tr>
        </thead>
        <tbody class="text-text-secondary">
          <tr class="border-b border-border"><td class="p-3">Pressure rating</td><td class="p-3 text-text-primary font-medium">10,000–15,000</td><td class="p-3">psi</td><td class="p-3">API 6A</td></tr>
          <tr class="border-b border-border"><td class="p-3">Bore size range</td><td class="p-3 text-text-primary font-medium">2-1/16 – 7-1/16</td><td class="p-3">in</td><td class="p-3">API 6A</td></tr>
          <tr class="border-b border-border"><td class="p-3">Material class</td><td class="p-3 text-text-primary font-medium">FF / EE / DD</td><td class="p-3">—</td><td class="p-3">NACE MR0175</td></tr>
          <tr class="border-b border-border"><td class="p-3">Temperature range</td><td class="p-3 text-text-primary font-medium">−50 to 250</td><td class="p-3">°F</td><td class="p-3">API 6A Class U</td></tr>
          <tr class="border-b border-border"><td class="p-3">Flow coefficient (Cv)</td><td class="p-3 text-text-primary font-medium">0.15 – 285</td><td class="p-3">—</td><td class="p-3">ISA 75.02</td></tr>
          <tr class="border-b border-border"><td class="p-3">Trim options</td><td class="p-3 text-text-primary font-medium">Tungsten carbide / Stellite</td><td class="p-3">—</td><td class="p-3">—</td></tr>
          <tr><td class="p-3">Seat leakage class</td><td class="p-3 text-text-primary font-medium">Class VI</td><td class="p-3">—</td><td class="p-3">API 598 / FCI 70-2</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>`,
    schema_json: '{"settings":[{"type":"text","id":"heading","label":"Heading","default":"Technical Specifications"},{"type":"text","id":"model","label":"Model / Subtitle","default":""}],"blocks":[{"type":"spec-row","name":"Spec Row","limit":30,"settings":[{"type":"text","id":"parameter","label":"Parameter"},{"type":"text","id":"value","label":"Value"},{"type":"text","id":"unit","label":"Unit"},{"type":"text","id":"standard","label":"Standard / Ref."}]}]}',
    default_props_json: '{"heading":"Technical Specifications"}',
  },
]
