-- 0063_cad_design_gate.sql
-- Sprint 196D — the design gate. A CAD run must have a CONVERGED, calc-grounded
-- design before any geometry is generated. These columns carry the duty (the
-- inputs), the solved design (the calc-grounded output), the design outcome, and
-- the verbatim solver diagnosis when a design does not close.
-- D1 requires one ALTER per statement — do NOT combine.

ALTER TABLE cad_convergence_runs ADD COLUMN duty_json TEXT;

ALTER TABLE cad_convergence_runs ADD COLUMN design_json TEXT;

-- 'converged' | 'infeasible' | 'ungrounded'
ALTER TABLE cad_convergence_runs ADD COLUMN design_status TEXT;

ALTER TABLE cad_convergence_runs ADD COLUMN design_diagnosis TEXT;
