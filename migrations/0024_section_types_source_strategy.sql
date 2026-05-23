ALTER TABLE design_section_types ADD COLUMN source TEXT DEFAULT 'builtin';
ALTER TABLE design_section_types ADD COLUMN render_strategy TEXT DEFAULT 'claude';
ALTER TABLE design_section_types ADD COLUMN template_html TEXT;
