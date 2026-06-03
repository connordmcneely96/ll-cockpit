// ATLAS RAG Tier-1 open-access corpus seed — Sprint 30C.
// Content rules: open-access + paraphrased standard formulas ONLY.
// NO verbatim text from paid specs (API 610, ASME BPVC full, Roark's, Shigley's,
// Machinery's Handbook — those are tracked Tier-2/3 follow-ons).
// Each entry is section-headed markdown so the chunker tags sections correctly.

export const CORPUS: { doc: string; page?: number; text: string }[] = [

  // ── PIPING — ASME B31.3 (open sections + paraphrased) ──
  {
    doc: "B31.3_piping",
    page: 1,
    text: `## B31.3 §300 Scope and General Requirements
ASME B31.3 Process Piping governs the design, materials, fabrication, examination, inspection, testing, and operation of process piping systems in petroleum refining, chemical, pharmaceutical, textile, paper, semiconductor, and cryogenic plants, and related processing plants and terminals.

## B31.3 §302.3 Allowable Stresses and Other Stress Limits
Allowable stress values S for piping materials are tabulated in ASME B31.3 Appendix A. The allowable stress at temperature is the lesser of one-third the specified minimum tensile strength, two-thirds the specified minimum yield strength, and other criteria including creep. For ASTM A106 Grade B seamless carbon steel pipe, S = 20,000 psi at 100°F. For ASTM A312 TP316 stainless steel pipe, S = 16,700 psi at 100°F.

## B31.3 §304.1.1 Straight Pipe — General
The required thickness of straight pipe under internal pressure is governed by the hoop stress equation. The design must account for mechanical, corrosion, and erosion allowances. The minimum required wall thickness t_m = t + c, where t is the pressure design thickness and c is the sum of mechanical, corrosion, and erosion allowances.`,
  },
  {
    doc: "B31.3_piping",
    page: 2,
    text: `## B31.3 §304.1.2 Straight Pipe Under Internal Pressure — Thickness Formula
The pressure design thickness for straight pipe (paraphrased from B31.3 Eq. 3a): t = PD / (2(SE + PY)), where P is the internal design gauge pressure (psi), D is the outside diameter (in), S is the allowable stress at design temperature (psi), E is the weld quality factor (1.0 for seamless), and Y is a temperature coefficient (0.4 for ferritic steels ≤900°F). For thin-wall pipe (t < D/6), this reduces approximately to t ≈ PD / (2SE).

## B31.3 §304.2.3 Branch Connections — Pressure Design
Reinforcement of branch connections must account for the material removed at the intersection. The required reinforcement area equals the area removed minus the excess thickness in the run and branch pipe walls. Reinforcing pads, saddles, or extruded outlets are common solutions. The limit of reinforcement extends a distance d from the branch centerline along the run and 2.5 times the branch nominal wall thickness above the outside surface.

## B31.3 §341 Required Examination — Pressure Testing
All piping systems must be pressure tested before initial operation. The standard hydrostatic test pressure is 1.5 times the design pressure. Pneumatic testing at 1.1 times the design pressure is permitted where hydrostatic testing is not practical. Leak testing is required for Category D fluid service systems.`,
  },

  // ── PRESSURE VESSELS — paraphrased ASME approach ──
  {
    doc: "ASME_vessel_paraphrased",
    page: 1,
    text: `## ASME Vessel Design — Shell Thickness Under Internal Pressure (Paraphrased)
For cylindrical pressure vessel shells under internal pressure, the minimum required shell thickness (paraphrasing the ASME approach) is: t = PR / (SE - 0.6P), where P is the maximum allowable working pressure, R is the inside radius, S is the maximum allowable stress of the shell material, and E is the joint efficiency. This formula is valid when t < 0.5R. For thicker shells or higher pressure ratios, the more rigorous Lamé equation applies.

## ASME Vessel Design — Head Types and Thickness
Hemispherical heads carry pressure most efficiently; the required thickness is approximately half that of a cylindrical shell of the same diameter. Ellipsoidal 2:1 heads (ratio of major to minor axis = 2:1) have a required thickness approximately equal to the shell. Torispherical (ASME flanged and dished) heads have a required thickness approximately equal to the shell for standard proportions. Flat heads require significantly greater thickness due to bending rather than membrane stress.

## ASME Vessel Design — Nozzle Reinforcement
Nozzles and other openings in pressure vessel shells weaken the shell and require reinforcement. The area replacement method requires that the reinforcing area within the limit of reinforcement equal or exceed the area of metal removed. The total required reinforcement area A = d × t_r × F, where d is the nozzle inside diameter, t_r is the required shell thickness, and F is a correction factor.`,
  },

  // ── MOTORS — NEMA MG-1 (educational excerpts) ──
  {
    doc: "NEMA_MG1_motors",
    page: 1,
    text: `## NEMA MG-1 Part 1 — Definitions and General Standards
NEMA MG-1 establishes standards for motors and generators manufactured in the United States. Key definitions: Rated horsepower is the output power at the shaft under continuous duty at rated voltage, frequency, and ambient temperature. Service factor is a multiplier applied to rated horsepower to indicate permissible overload; a 1.15 service factor motor can operate continuously at 115% of nameplate horsepower without exceeding temperature limits. Efficiency is the ratio of mechanical output to electrical input power.

## NEMA MG-1 §12.1 Frame Assignments — T-Frame Dimensions
NEMA T-frame motors use a standardized frame designation system where the first two or three digits of the frame number divided by 16 give the shaft centerline height in inches. For example, a 256T frame has a shaft height of 256/16 = 16 inches. The letter suffix indicates mounting and shaft configuration: T (standard), TC (C-face), TD (D-flange). Frame 143T through 445T cover the 1–200 HP range for most industrial applications.

## NEMA MG-1 §12.50 Motor Temperature Rise Limits
NEMA defines insulation classes by maximum allowable temperature rise above a 40°C ambient. Class B insulation: 80°C rise (total 120°C). Class F insulation: 105°C rise (total 145°C). Class H insulation: 125°C rise (total 165°C). Most premium-efficiency motors use Class F insulation with Class B rise, providing a thermal margin that extends winding life. The hot-spot allowance is an additional 10°C added to the winding temperature rise limit.`,
  },
  {
    doc: "NEMA_MG1_motors",
    page: 2,
    text: `## NEMA MG-1 §14 — Efficiency Standards (NEMA Premium)
NEMA Premium efficiency motors meet efficiency levels established by NEMA. For a 4-pole, 60 Hz, TEFC motor at 460V: 10 HP = 91.7% nominal efficiency, 25 HP = 93.6%, 50 HP = 94.5%, 100 HP = 95.0%, 200 HP = 95.4%. These levels exceed the EISA 2007 mandated minimum efficiencies by approximately 1–2 percentage points. Premium motors reduce energy costs and heat generation, extending bearing and insulation life.

## NEMA MG-1 §20 — Polyphase Induction Motor Starting Characteristics
NEMA design codes (A, B, C, D) define starting torque and current characteristics. Design B motors (most common) have normal starting torque (100–150% of full-load torque) and normal locked-rotor current (600% of full-load current typical). Design C motors have high starting torque for hard-to-start loads. Design D motors (high slip) have very high starting torque. Starting current draw is a key consideration for power system design and motor starter selection.`,
  },

  // ── GEARS — AGMA 2001 (educational excerpts) ──
  {
    doc: "AGMA2001_gears",
    page: 1,
    text: `## AGMA 2001 — Scope and Fundamental Rating Factors
AGMA 2001 provides a method for rating the pitting resistance and bending strength of spur and helical gear teeth. The rating approach uses allowable stress numbers for the gear material, application factors, load distribution factors, dynamic factors, and geometry factors. The fundamental formula for bending strength rating: W_t / (F × m_t) ≤ S_at × Y_J / (K_o × K_v × K_s × K_H × K_B), where W_t is the transmitted tangential load, F is the face width, m_t is the transverse metric module, S_at is the allowable bending stress, and Y_J is the bending strength geometry factor.

## AGMA 2001 — Pitting Resistance (Surface Durability)
Contact stress governs pitting resistance. The AGMA contact stress number (paraphrased): σ_c = Z_E × √(W_t × K_o × K_v × K_s × K_H / (d_w1 × F × Z_R)) ≤ S_ac × Z_N × Z_W / (S_H × K_T × K_R), where Z_E is the elastic coefficient, d_w1 is the operating pitch diameter of the pinion, Z_R is the surface condition factor, S_ac is the allowable contact stress number, Z_N is the stress cycle factor for pitting resistance, S_H is the pitting resistance safety factor, K_T is the temperature factor, and K_R is the reliability factor.

## AGMA 2001 — Material Grades and Allowable Stresses
AGMA specifies three material grades (1, 2, 3) for steel gears. Grade 1 is through-hardened steel (180–400 HBW). Grade 2 is case-hardened or carburized steel. Grade 3 is premium-quality case-hardened steel with tight controls. Allowable bending stress S_at for Grade 1 through-hardened steel: S_at = 0.533 × HBW + 88.3 MPa (approximately). Allowable contact stress S_ac = 2.22 × HBW + 200 MPa for Grade 1.`,
  },
  {
    doc: "AGMA2001_gears",
    page: 2,
    text: `## AGMA 2001 — Application Factor K_o
The application factor K_o accounts for externally applied loads exceeding the nominal transmitted load. Values depend on the power source and driven machine characteristics. Uniform power source + uniform driven machine: K_o = 1.00. Uniform source + moderate shock: K_o = 1.25–1.50. Light shock source + heavy shock driven: K_o = 1.75+. For centrifugal pumps driven by electric motors, K_o = 1.25 is typical. For reciprocating compressors, K_o ≥ 1.75.

## AGMA 2001 — Dynamic Factor K_v
The dynamic factor K_v accounts for internally generated dynamic loads due to gear-mesh errors, elastic deformations, and tooth geometry variations. K_v depends on pitch-line velocity and AGMA quality number. Higher quality numbers (tighter tolerances) reduce dynamic loads. At 10 m/s pitch-line velocity, AGMA quality 10 gives K_v ≈ 1.15 vs quality 6 giving K_v ≈ 1.45. Dynamic factors decrease gear rating and should be minimized through tight manufacturing tolerances and adequate lubrication.`,
  },

  // ── STRUCTURAL — AISC 360 (educational excerpts) ──
  {
    doc: "AISC360_structural",
    page: 1,
    text: `## AISC 360 §B3 — Design Basis (LRFD and ASD)
AISC 360 Specification for Structural Steel Buildings provides two design methods. Load and Resistance Factor Design (LRFD): φR_n ≥ ΣγQ_i, where φ is the resistance factor (≤1.0), R_n is the nominal strength, γ are load factors (1.2D + 1.6L typical), and Q_i are nominal loads. Allowable Strength Design (ASD): R_n/Ω ≥ ΣQ_i, where Ω is the safety factor. LRFD generally gives more economical designs for live-load-dominated structures. ASD is simpler and widely used for service load calculations.

## AISC 360 §F2 — Doubly Symmetric Compact I-Shaped Members in Bending
For compact wide-flange sections in strong-axis bending (the most common case), the nominal flexural strength M_n = M_p = F_y × Z_x, where F_y is the yield stress and Z_x is the plastic section modulus. This applies when the unbraced length L_b ≤ L_p (plastic limit). For L_p < L_b ≤ L_r (inelastic lateral-torsional buckling), M_n decreases linearly from M_p to 0.7F_y × S_x. For L_b > L_r (elastic LTB), M_n is governed by the elastic LTB equation involving C_b, S_x, and the elastic LTB moment M_e.

## AISC 360 §J3 — Bolted Connections
High-strength bolts (ASTM A325 and A490) are the standard for structural connections. Bolt shear strength (single shear, bearing-type): φR_n = φ × 0.60 × F_u × A_b, where φ = 0.75 for shear, F_u is the bolt tensile strength (120 ksi for A325, 150 ksi for A490), and A_b is the bolt cross-sectional area. Slip-critical connections use pretensioned bolts with friction as the load transfer mechanism; they are required where slip would be detrimental (e.g., joints subject to fatigue or reversal of load direction).`,
  },
  {
    doc: "AISC360_structural",
    page: 2,
    text: `## AISC 360 §D2 — Tensile Strength of Members
The nominal tensile strength of a member is the lesser of: yielding on gross area T_n = F_y × A_g (φ = 0.90, Ω = 1.67), and fracture on effective net area T_n = F_u × A_e (φ = 0.75, Ω = 2.00), where A_e = U × A_n is the effective net area, U is the shear lag factor (≤1.0), and A_n is the net area accounting for bolt holes. For plates connected through all elements, U = 1.0. For angles connected through one leg, U = 0.80 (two or more bolts per line).

## AISC 360 §E3 — Flexural Buckling of Members Without Slender Elements
For compression members without slender elements, the nominal compressive strength: F_cr = [0.658^(F_y/F_e)] × F_y when (KL/r)√(F_y/E) ≤ 1.5 (inelastic buckling). F_cr = [0.877/λ_c²] × F_y when (KL/r)√(F_y/E) > 1.5 (elastic/Euler buckling), where F_e = π²E/(KL/r)² is the elastic critical stress, K is the effective length factor, L is the unbraced length, r is the radius of gyration, and E = 29,000 ksi for steel. Practical slenderness limit KL/r ≤ 200 for compression members.`,
  },

  // ── PUMPS / ROTORDYNAMICS — paraphrased API 610 approach + open content ──
  {
    doc: "pump_rotordynamics",
    page: 1,
    text: `## Centrifugal Pump Fundamentals — Affinity Laws
The pump affinity laws (paraphrased) describe how performance varies with speed: flow Q scales linearly with speed N (Q₂/Q₁ = N₂/N₁), head H scales with the square of speed (H₂/H₁ = (N₂/N₁)²), and power P scales with the cube of speed (P₂/P₁ = (N₂/N₁)³). These laws apply exactly for dynamically similar operation (same efficiency point). Variable-speed drives leverage the cube law: reducing speed to 80% reduces power to 51.2%, offering substantial energy savings.

## Shaft Critical Speed — Undamped Analysis (Paraphrased)
The first undamped critical speed of a shaft (Rayleigh-Ritz approximation, paraphrased): ω_c = √(Σ(k_i × δ_i²) / Σ(m_i × δ_i²)), where k_i are bearing stiffness values, m_i are lumped masses, and δ_i are static deflections under gravity. For a simply-supported uniform shaft with a central mass M and no distributed mass: ω_c ≈ √(48EI / (M × L³)), where E is Young's modulus, I is the second moment of area, and L is the bearing span. Operating speed must maintain ≥15% margin below the first critical speed (or ≥25% above it) per typical API practice.

## Specific Speed and Pump Selection
Specific speed N_s = N × √Q / H^(3/4) (in US customary: rpm, gpm, ft) characterizes impeller geometry. Low specific speed (N_s < 1,000): radial flow impellers, high head, low flow. Mixed flow (1,000 < N_s < 6,000). High specific speed (N_s > 6,000): axial flow impellers, low head, high flow. Optimal pump efficiency occurs at the best efficiency point (BEP). Operating far from BEP increases radial thrust, vibration, and wear.`,
  },
  {
    doc: "pump_rotordynamics",
    page: 2,
    text: `## Mechanical Seal Fundamentals — API 682
API 682 (Shaft Sealing Systems for Centrifugal and Rotary Pumps) classifies seal arrangements: Arrangement 1 (single seal), Arrangement 2 (dual unpressurized), Arrangement 3 (dual pressurized). Seal types: Type A (pusher), Type B (non-pusher/bellows), Type C (non-pusher with secondary containment). Flush plans govern the seal environment: Plan 11 (recirculation from pump discharge), Plan 23 (cooled recirculation through heat exchanger), Plan 53A (pressurized barrier fluid reservoir for Arrangement 3). The barrier/buffer fluid pressure in Arrangement 3 must exceed the product pressure by 1.4–2.1 bar.

## Pump Vibration Limits — ISO 10816 / API 610
ISO 10816-7 governs vibration measurement and evaluation for pumps. For Class I machines (rigid support, P < 15 kW), RMS velocity ≤ 2.8 mm/s is "good," 2.8–7.1 mm/s is "acceptable," >7.1 mm/s is "unsatisfactory." API 610 (11th ed.) limits overall vibration to 5 mm/s RMS at rated conditions for between-bearings pumps. Twice-running-speed (2X) vibration exceeding 50% of 1X indicates potential misalignment. Subsynchronous vibration (below 1X) may indicate impeller recirculation or rotating stall.`,
  },

  // ── SHAFT STRESS — paraphrased mechanical formulas ──
  {
    doc: "shaft_design_formulas",
    page: 1,
    text: `## Shaft Design — Torsional Shear Stress (Paraphrased)
The torsional shear stress in a circular shaft (paraphrased from standard mechanics of materials): τ = T × c / J = 16T / (π × d³) for solid round shafts, where T is the applied torque (lb·in or N·mm), c is the outer radius, J = π × d⁴ / 32 is the polar second moment of area, and d is the shaft diameter. For a solid shaft transmitting power P (hp) at speed N (rpm): T = 63,025 × P / N (lb·in) or T = 9,550,000 × P_kW / N (N·mm). The allowable torsional shear stress for steel shafts is typically 0.30 × S_y to 0.40 × S_y.

## Shaft Design — von Mises Equivalent Stress (Paraphrased, Shigley Approach)
For combined bending and torsion, the von Mises (distortion energy) equivalent stress approach (paraphrased from Shigley's mechanical engineering design): σ'_e = √(σ_b² + 3τ²), where σ_b = 32M / (π × d³) is the bending stress and τ = 16T / (π × d³) is the torsional shear stress. The ASME-Elliptic fatigue criterion (paraphrased): 1/n = √[(σ_a/S_e)² + (σ_m/S_ut)²], where σ_a is the alternating stress amplitude, σ_m is the mean stress, S_e is the endurance limit, and S_ut is the ultimate tensile strength. The factor of safety n ≥ 1.5 is typical for rotating machinery.

## Shaft Design — Minimum Diameter from Fatigue (Paraphrased)
The minimum shaft diameter to meet a target fatigue safety factor n (paraphrased, Goodman criterion): d ≥ [16n/π × √(4(K_f × M_a)² + 3(K_fs × T_a)²) / S_e + √(4(K_f × M_m)² + 3(K_fs × T_m)²) / S_ut]^(1/3), where K_f and K_fs are fatigue stress concentration factors for bending and torsion, M_a and T_a are alternating components, M_m and T_m are mean components. This diameter is the starting point for further analysis including deflection and critical speed.`,
  },

  // ── BEARING LIFE — ISO 281 paraphrased ──
  {
    doc: "bearing_life_ISO281",
    page: 1,
    text: `## Bearing L10 Life — ISO 281 (Paraphrased)
The basic rating life L₁₀ is the number of revolutions (or hours at a given speed) that 90% of a group of identical bearings will complete or exceed before fatigue pitting occurs (paraphrased from ISO 281): L₁₀ = (C/P)^p × 10⁶ revolutions, where C is the basic dynamic load rating (N), P is the equivalent dynamic bearing load (N), and p = 3 for ball bearings, p = 10/3 for roller bearings. In hours: L₁₀h = L₁₀ × 10⁶ / (60 × n), where n is the speed in rpm. For general industrial machinery, L₁₀h = 20,000–30,000 hours is typical design target; for critical continuous-process pumps, 50,000+ hours.

## Bearing Selection — Equivalent Dynamic Load
The equivalent dynamic load P accounts for combined radial and axial forces: P = X × F_r + Y × F_a, where F_r is the radial force, F_a is the axial force, and X and Y are radial and axial load factors from the bearing manufacturer's tables. For pure radial loading (F_a/F_r ≤ e, where e is a tabulated factor), P = F_r. For angular contact ball bearings (15° contact angle), e ≈ 0.44, X = 1.0, Y = 1.47 when F_a/F_r > e. The load on each bearing in a simply-supported shaft with a central radial load W is W/2 for symmetric geometry.

## Bearing Life Modification — ISO 281 a_ISO Factor
The modified rating life accounts for reliability, lubrication, and contamination: L_nm = a₁ × a_ISO × L₁₀, where a₁ is the reliability factor (a₁ = 1.0 for 90%, 0.62 for 95%, 0.33 for 99% reliability), and a_ISO is the life modification factor incorporating viscosity ratio κ = ν/ν₁ (actual to required viscosity) and contamination factor e_C. Adequate lubrication (κ ≥ 1) and cleanliness (e_C close to 1) can increase life by 3–10× over the basic L₁₀. Contamination is typically the dominant life-limiting factor in industrial applications.`,
  },

  // ── FATIGUE / FRACTURE MECHANICS — paraphrased ──
  {
    doc: "fatigue_fracture_paraphrased",
    page: 1,
    text: `## Endurance Limit Estimation — Modified Goodman (Paraphrased)
For steel components, the endurance limit S_e' (the fatigue stress limit at 10⁶ cycles under rotating bending) is approximately 0.5 × S_ut for S_ut ≤ 200 ksi (1400 MPa); for higher-strength steels, S_e' ≈ 100 ksi (690 MPa). The corrected endurance limit S_e = k_a × k_b × k_c × k_d × k_e × S_e', where the modification factors account for: k_a = surface finish (machined steel: 0.72–0.87 depending on S_ut), k_b = size (d ≤ 51 mm: 0.85), k_c = loading type (bending: 1.0, axial: 0.85, torsion: 0.59), k_d = temperature, k_e = reliability (0.897 for 95%).

## Stress Concentration Factors — Shoulder Fillets on Shafts
Geometric stress concentration factors K_t for shoulder fillets (paraphrased from Peterson's): for a shaft with D/d = 1.5 and r/d = 0.1, K_t ≈ 1.65 in bending, K_ts ≈ 1.45 in torsion. Fatigue stress concentration factor K_f = 1 + q(K_t - 1), where q is the notch sensitivity (0.7–0.9 for steel, higher for high-strength steel). Increasing fillet radius r/d from 0.05 to 0.15 typically reduces K_t from about 2.0 to 1.5 in bending — a significant improvement achievable through design alone.`,
  },

  // ── WELDING / CONNECTIONS — paraphrased AWS D1.1 approach ──
  {
    doc: "welding_structural_paraphrased",
    page: 1,
    text: `## Fillet Weld Strength — AWS D1.1 Approach (Paraphrased)
The design strength of a fillet weld per unit length (paraphrased from AWS D1.1 structural welding approach): R_n/L = 0.6 × F_EXX × A_w, where F_EXX is the electrode classification tensile strength (e.g., 70 ksi for E70XX), A_w = 0.707 × w (the effective weld throat for a flat-face fillet of leg size w), and the resistance factor φ = 0.75 (LRFD). For a fillet weld loaded at angle θ to the weld axis, the strength is increased by the factor (1.0 + 0.5 sin^1.5(θ)): transverse welds (θ = 90°) are 50% stronger than longitudinal welds (θ = 0°) by this factor.

## Prequalified Welded Joint Details — AWS D1.1
AWS D1.1 Table 3.7 lists prequalified complete joint penetration (CJP) and partial joint penetration (PJP) groove weld details. For CJP groove welds, the design tensile strength equals the base metal strength (no weld strength reduction if the electrode matches or exceeds the base metal). For PJP groove welds, effective throat E is the depth of chamfer minus 3 mm (for joints welded from one side with no backing). Minimum preheat and interpass temperatures are specified in Table 3.2 by base metal category and thickness.`,
  },

  // ── FLUID SYSTEMS — open content ──
  {
    doc: "fluid_systems_engineering",
    page: 1,
    text: `## Pipe Flow — Darcy-Weisbach Pressure Drop (Open Knowledge)
Head loss due to friction in a circular pipe: h_f = f × (L/D) × (v²/2g), where f is the Darcy friction factor, L is the pipe length, D is the inside diameter, v is the mean flow velocity, and g is gravitational acceleration. For turbulent flow in smooth pipes, the Colebrook-White equation implicitly defines f: 1/√f = -2 log₁₀(ε/(3.7D) + 2.51/(Re × √f)), where ε is the absolute roughness and Re is the Reynolds number. The explicit Swamee-Jain approximation: f = 0.25 / [log₁₀(ε/(3.7D) + 5.74/Re^0.9)]² is accurate within 3% for 10⁻⁶ < ε/D < 10⁻² and 5×10³ < Re < 10⁸.

## Pipe Flow — Minor Losses and System Curve
Minor (local) losses: h_m = K × v²/(2g), where K is the loss coefficient (K ≈ 0.3 for long-radius elbow, 1.0 for globe valve fully open, 0.5 for sharp-edged entrance). Total system head H_sys = H_static + (f × L/D + ΣK) × v²/(2g). The pump operating point is where the pump H-Q curve intersects the system curve. Net positive suction head available: NPSHA = H_a - H_vp + H_z - h_f,s, where H_a is atmospheric head, H_vp is vapor pressure head, H_z is suction static head, and h_f,s is suction line friction loss. NPSHA must exceed NPSHR (required) with a margin ≥ 0.6 m.`,
  },
];
