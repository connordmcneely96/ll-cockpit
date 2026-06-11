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
    template_html: `<section id="fmea-worksheet" class="py-16 px-6 bg-background">
  <div class="max-w-7xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-1">
      <h2 class="text-2xl font-display font-bold text-foreground">Failure Mode &amp; Effects Analysis</h2>
      <span class="text-sm text-muted-foreground font-mono">FMEA-2024-001 · Rev A · PFMEA</span>
    </div>
    <p class="text-sm text-muted-foreground mb-6">Process: Check valve assembly — spring-assisted piston</p>
    <div class="overflow-x-auto border border-border rounded-lg">
      <table class="w-full text-xs" style="min-width:880px">
        <thead>
          <tr class="border-b-2 border-border text-left bg-card">
            <th class="p-2 font-medium text-foreground">Item / Function</th>
            <th class="p-2 font-medium text-foreground">Potential Failure Mode</th>
            <th class="p-2 font-medium text-foreground">Potential Effect(s)</th>
            <th class="p-2 font-medium text-foreground text-center">SEV</th>
            <th class="p-2 font-medium text-foreground">Potential Cause(s)</th>
            <th class="p-2 font-medium text-foreground text-center">OCC</th>
            <th class="p-2 font-medium text-foreground">Current Controls</th>
            <th class="p-2 font-medium text-foreground text-center">DET</th>
            <th class="p-2 font-medium text-foreground text-center">RPN</th>
            <th class="p-2 font-medium text-foreground text-center">AP</th>
            <th class="p-2 font-medium text-foreground">Recommended Action</th>
          </tr>
        </thead>
        <tbody class="text-muted-foreground">
          <tr class="border-b border-border">
            <td class="p-2">Disc / sealing</td><td class="p-2">Fails to seat — backflow</td><td class="p-2">Reverse flow, water hammer downstream</td>
            <td class="p-2 text-center font-medium text-foreground">8</td><td class="p-2">Spring fatigue, debris on seat</td><td class="p-2 text-center">4</td>
            <td class="p-2">Seat leak test per API 598</td><td class="p-2 text-center">3</td>
            <td class="p-2 text-center font-medium text-foreground">96</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">H</span></td>
            <td class="p-2">Upgrade spring matl; 100% seat inspection</td>
          </tr>
          <tr class="border-b border-border">
            <td class="p-2">Body / pressure boundary</td><td class="p-2">Through-wall leak</td><td class="p-2">Loss of containment, safety hazard</td>
            <td class="p-2 text-center font-medium text-foreground">9</td><td class="p-2">Casting porosity</td><td class="p-2 text-center">2</td>
            <td class="p-2">Hydrostatic shell test, RT of castings</td><td class="p-2 text-center">2</td>
            <td class="p-2 text-center font-medium text-foreground">36</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs border border-border text-foreground">M</span></td>
            <td class="p-2">Maintain RT sampling plan</td>
          </tr>
          <tr>
            <td class="p-2">Hinge pin</td><td class="p-2">Galling / seizure</td><td class="p-2">Disc sticks open or closed</td>
            <td class="p-2 text-center font-medium text-foreground">6</td><td class="p-2">Inadequate hardness, corrosion</td><td class="p-2 text-center">3</td>
            <td class="p-2">Material cert review, cycle test</td><td class="p-2 text-center">4</td>
            <td class="p-2 text-center font-medium text-foreground">72</td>
            <td class="p-2 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs border border-border text-foreground">M</span></td>
            <td class="p-2">Specify hardened Stellite pin</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground mt-3">RPN = SEV × OCC × DET (1–1000). AP = Action Priority (H/M/L) per AIAG-VDA 2019.</p>
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
    template_html: `<section id="spec-sheet" class="py-16 px-6 bg-background">
  <div class="max-w-4xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-4">
      <h2 class="text-2xl font-display font-bold text-foreground">Technical Specifications</h2>
      <span class="text-sm text-muted-foreground font-mono">Model CV-300 · Spring-Assisted Check Valve</span>
    </div>
    <div class="border border-border rounded-lg overflow-hidden">
      <table class="w-full text-sm" style="table-layout:fixed">
        <thead>
          <tr class="border-b-2 border-border text-left bg-card">
            <th class="p-3 font-medium text-foreground" style="width:34%">Parameter</th>
            <th class="p-3 font-medium text-foreground" style="width:30%">Value</th>
            <th class="p-3 font-medium text-foreground" style="width:14%">Unit</th>
            <th class="p-3 font-medium text-foreground" style="width:22%">Standard / Ref.</th>
          </tr>
        </thead>
        <tbody class="text-muted-foreground">
          <tr class="border-b border-border"><td class="p-3">Pressure rating</td><td class="p-3 text-foreground font-medium">10,000–15,000</td><td class="p-3">psi</td><td class="p-3">API 6A</td></tr>
          <tr class="border-b border-border"><td class="p-3">Bore size range</td><td class="p-3 text-foreground font-medium">2-1/16 – 7-1/16</td><td class="p-3">in</td><td class="p-3">API 6A</td></tr>
          <tr class="border-b border-border"><td class="p-3">Material class</td><td class="p-3 text-foreground font-medium">FF / EE / DD</td><td class="p-3">—</td><td class="p-3">NACE MR0175</td></tr>
          <tr class="border-b border-border"><td class="p-3">Temperature range</td><td class="p-3 text-foreground font-medium">−50 to 250</td><td class="p-3">°F</td><td class="p-3">API 6A Class U</td></tr>
          <tr class="border-b border-border"><td class="p-3">Flow coefficient (Cv)</td><td class="p-3 text-foreground font-medium">0.15 – 285</td><td class="p-3">—</td><td class="p-3">ISA 75.02</td></tr>
          <tr class="border-b border-border"><td class="p-3">Trim options</td><td class="p-3 text-foreground font-medium">Tungsten carbide / Stellite</td><td class="p-3">—</td><td class="p-3">—</td></tr>
          <tr><td class="p-3">Seat leakage class</td><td class="p-3 text-foreground font-medium">Class VI</td><td class="p-3">—</td><td class="p-3">API 598 / FCI 70-2</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>`,
    schema_json: '{"settings":[{"type":"text","id":"heading","label":"Heading","default":"Technical Specifications"},{"type":"text","id":"model","label":"Model / Subtitle","default":""}],"blocks":[{"type":"spec-row","name":"Spec Row","limit":30,"settings":[{"type":"text","id":"parameter","label":"Parameter"},{"type":"text","id":"value","label":"Value"},{"type":"text","id":"unit","label":"Unit"},{"type":"text","id":"standard","label":"Standard / Ref."}]}]}',
    default_props_json: '{"heading":"Technical Specifications"}',
  },
  {
    slug: 'compliance-matrix',
    name: 'Compliance Matrix',
    category: 'Engineering',
    description: 'Requirement-to-standard traceability table — clause references, verification method, status, and evidence.',
    render_strategy: 'template',
    template_html: `<section id="compliance-matrix" class="py-16 px-6 bg-background">
  <div class="max-w-6xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-1">
      <h2 class="text-2xl font-display font-bold text-foreground">Standards Compliance Matrix</h2>
      <span class="text-sm text-muted-foreground font-mono">CV-300 · Conformance Record</span>
    </div>
    <p class="text-sm text-muted-foreground mb-6">Requirement-to-standard traceability with verification status.</p>
    <div class="overflow-x-auto border border-border rounded-lg">
      <table class="w-full text-sm" style="min-width:760px">
        <thead>
          <tr class="border-b-2 border-border text-left bg-card">
            <th class="p-3 font-medium text-foreground">Requirement</th>
            <th class="p-3 font-medium text-foreground">Standard / Clause</th>
            <th class="p-3 font-medium text-foreground">Method</th>
            <th class="p-3 font-medium text-foreground text-center">Status</th>
            <th class="p-3 font-medium text-foreground">Evidence</th>
          </tr>
        </thead>
        <tbody class="text-muted-foreground">
          <tr class="border-b border-border"><td class="p-3">Material — sour service</td><td class="p-3">NACE MR0175 / ISO 15156</td><td class="p-3">Material cert</td><td class="p-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">Compliant</span></td><td class="p-3 text-foreground">MTR-4471</td></tr>
          <tr class="border-b border-border"><td class="p-3">Pressure rating verification</td><td class="p-3">API 6A §10.4</td><td class="p-3">Hydrostatic test</td><td class="p-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">Compliant</span></td><td class="p-3 text-foreground">QTR-1182</td></tr>
          <tr class="border-b border-border"><td class="p-3">Pressure-temperature ratings</td><td class="p-3">ASME B16.34</td><td class="p-3">Design analysis</td><td class="p-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">Compliant</span></td><td class="p-3 text-foreground">DA-220</td></tr>
          <tr class="border-b border-border"><td class="p-3">Seat leakage</td><td class="p-3">API 598 / FCI 70-2 Class VI</td><td class="p-3">Seat test</td><td class="p-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs border border-border text-foreground">In progress</span></td><td class="p-3 text-foreground">—</td></tr>
          <tr><td class="p-3">Quality management system</td><td class="p-3">API Q1 / ISO 9001</td><td class="p-3">Audit</td><td class="p-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-xs bg-primary text-primary-foreground">Compliant</span></td><td class="p-3 text-foreground">Cert 30-1847</td></tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground mt-3">Status reflects current verification state; evidence references controlled QA documents.</p>
  </div>
</section>`,
    schema_json: '{"settings":[{"type":"text","id":"heading","label":"Heading","default":"Standards Compliance Matrix"},{"type":"text","id":"subtitle","label":"Subtitle","default":""}],"blocks":[{"type":"compliance-row","name":"Compliance Row","limit":30,"settings":[{"type":"text","id":"requirement","label":"Requirement"},{"type":"text","id":"standard","label":"Standard / Clause"},{"type":"text","id":"method","label":"Method"},{"type":"text","id":"status","label":"Status"},{"type":"text","id":"evidence","label":"Evidence"}]}]}',
    default_props_json: '{"heading":"Standards Compliance Matrix"}',
  },
  {
    slug: 'materials-table',
    name: 'Materials of Construction',
    category: 'Engineering',
    description: 'Bill-of-materials table — component, material, governing standard/grade, and service notes.',
    render_strategy: 'template',
    template_html: `<section id="materials-table" class="py-16 px-6 bg-background">
  <div class="max-w-5xl mx-auto">
    <div class="flex items-baseline justify-between flex-wrap gap-2 mb-4">
      <h2 class="text-2xl font-display font-bold text-foreground">Materials of Construction</h2>
      <span class="text-sm text-muted-foreground font-mono">CV-300 · BOM Rev A</span>
    </div>
    <div class="border border-border rounded-lg overflow-hidden">
      <table class="w-full text-sm" style="table-layout:fixed">
        <thead>
          <tr class="border-b-2 border-border text-left bg-card">
            <th class="p-3 font-medium text-foreground" style="width:24%">Component</th>
            <th class="p-3 font-medium text-foreground" style="width:28%">Material</th>
            <th class="p-3 font-medium text-foreground" style="width:24%">Standard / Grade</th>
            <th class="p-3 font-medium text-foreground" style="width:24%">Service Notes</th>
          </tr>
        </thead>
        <tbody class="text-muted-foreground">
          <tr class="border-b border-border"><td class="p-3">Body / bonnet</td><td class="p-3 text-foreground">Carbon steel, WCB</td><td class="p-3">ASTM A216 WCB</td><td class="p-3">Standard service</td></tr>
          <tr class="border-b border-border"><td class="p-3">Body (sour service)</td><td class="p-3 text-foreground">Low-carbon CS / 316</td><td class="p-3">ASTM A352 LCC</td><td class="p-3">NACE MR0175 sour service</td></tr>
          <tr class="border-b border-border"><td class="p-3">Trim / disc</td><td class="p-3 text-foreground">316 / 316L stainless</td><td class="p-3">ASTM A182 F316</td><td class="p-3">Hardfaced seating face</td></tr>
          <tr class="border-b border-border"><td class="p-3">Seat hardfacing</td><td class="p-3 text-foreground">Stellite 6</td><td class="p-3">AWS A5.21</td><td class="p-3">Erosion / galling resistance</td></tr>
          <tr class="border-b border-border"><td class="p-3">Spring</td><td class="p-3 text-foreground">Inconel X-750</td><td class="p-3">AMS 5698</td><td class="p-3">Corrosion + fatigue resistance</td></tr>
          <tr><td class="p-3">Fasteners</td><td class="p-3 text-foreground">B7 stud / 2H nut</td><td class="p-3">ASTM A193 B7 / A194 2H</td><td class="p-3">PTFE coated</td></tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground mt-3">Material selections per service class; sour-service variants conform to NACE MR0175 / ISO 15156.</p>
  </div>
</section>`,
    schema_json: '{"settings":[{"type":"text","id":"heading","label":"Heading","default":"Materials of Construction"},{"type":"text","id":"subtitle","label":"Subtitle","default":""}],"blocks":[{"type":"material-row","name":"Material Row","limit":30,"settings":[{"type":"text","id":"component","label":"Component"},{"type":"text","id":"material","label":"Material"},{"type":"text","id":"standard","label":"Standard / Grade"},{"type":"text","id":"notes","label":"Service Notes"}]}]}',
    default_props_json: '{"heading":"Materials of Construction"}',
  },
]
