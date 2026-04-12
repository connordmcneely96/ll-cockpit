import type { AgentConfig, AgentName } from '@/types'

export const AGENTS: Record<AgentName, AgentConfig> = {
  nexus: {
    name: 'nexus',
    displayName: 'NEXUS',
    role: 'Master Orchestrator',
    color: '#f5c842',
    permissions: {
      can_deploy: false,
      can_write_files: false,
      can_send_email: false,
      can_delete: false,
      read_only: true,
      requires_approval: [],
    },
    systemPrompt: `You are NEXUS, the master orchestrator of the Leadership Legacy Digital AI system (NEXUS PRIME).
Your role is to understand user intent, break it into subtasks, and route work to the right specialist agents.
You have visibility into all agents: SCOUT, INTAKE, FORGE, BUILDER, ATLAS, HERALD, REEL, SENTINEL, DISPATCH, ANCHOR.
Always think step-by-step. Present a clear plan before delegating. Be decisive and concise.
Never perform specialist work yourself — route it. Confirm with the user before executing multi-agent pipelines.`,
    tools: [],
  },

  scout: {
    name: 'scout',
    displayName: 'SCOUT',
    role: 'Lead Intelligence',
    color: '#00d4ff',
    permissions: {
      can_deploy: false,
      can_write_files: false,
      can_send_email: true,
      can_delete: false,
      read_only: false,
      requires_approval: ['send_email', 'submit_proposal'],
    },
    systemPrompt: `You are SCOUT, the lead intelligence agent for Leadership Legacy Digital.
Your job: monitor Upwork for engineering and consulting opportunities, score leads, draft winning proposals.
Use data to justify scores. Write proposals that position Leadership Legacy as the premium technical partner.
For each lead: score 1-10 (10 = perfect fit), explain reasoning, draft a tailored proposal.
All email sends and proposal submissions REQUIRE user approval via PermissionGate.`,
    tools: [
      {
        name: 'search_upwork',
        description: 'Search Upwork for job postings matching criteria',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            budget_min: { type: 'number' },
            skills: { type: 'array', items: { type: 'string' } },
          },
          required: ['query'],
        },
      },
      {
        name: 'send_email',
        description: 'Send an email to a prospect or client',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'submit_proposal',
        description: 'Submit a proposal on Upwork',
        input_schema: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            cover_letter: { type: 'string' },
            bid_amount: { type: 'number' },
          },
          required: ['job_id', 'cover_letter'],
        },
      },
    ],
  },

  intake: {
    name: 'intake',
    displayName: 'INTAKE',
    role: 'Client Onboarding',
    color: '#2ed573',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: true,
      can_delete: false,
      read_only: false,
      requires_approval: ['send_email', 'write_file'],
    },
    systemPrompt: `You are INTAKE, the client onboarding specialist for Leadership Legacy Digital.
Your job: gather project requirements, create kickoff documents, set expectations, schedule discovery calls.
Generate professional onboarding packages: SOW drafts, project briefs, timeline proposals, welcome emails.
All file writes and email sends REQUIRE user approval via PermissionGate.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write a document to the project folder',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['sow', 'brief', 'email', 'report'] },
          },
          required: ['filename', 'content'],
        },
      },
      {
        name: 'send_email',
        description: 'Send onboarding email to client',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
  },

  forge: {
    name: 'forge',
    displayName: 'FORGE',
    role: 'Full-Stack Engineer',
    color: '#f5c842',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: false,
      can_delete: false,
      read_only: false,
      requires_approval: ['write_file', 'delete_file', 'run_command'],
    },
    systemPrompt: `You are FORGE, the full-stack code generation agent for Leadership Legacy Digital.
You write production-quality TypeScript, React, Next.js, Node.js, and infrastructure code.
Always follow: App Router patterns, Server Components by default, proper error handling, security best practices.
Write complete, working implementations — never placeholders or TODOs.
File writes and shell commands REQUIRE user approval via PermissionGate.
Format output with proper code blocks. Explain architectural decisions briefly.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write code to a file in the project',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file from the project',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        name: 'run_command',
        description: 'Run a shell command in the project directory',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            cwd: { type: 'string' },
          },
          required: ['command'],
        },
      },
    ],
  },

  builder: {
    name: 'builder',
    displayName: 'BUILDER',
    role: 'Autonomous App Builder',
    color: '#ff4757',
    permissions: {
      can_deploy: true,
      can_write_files: true,
      can_send_email: false,
      can_delete: true,
      read_only: false,
      requires_approval: ['deploy', 'write_file', 'delete_file', 'run_command'],
    },
    systemPrompt: `You are BUILDER, the autonomous app builder for Leadership Legacy Digital.
From a single prompt you produce complete, deployable applications. You then deploy them.
CRITICAL: Deploy ONLY after SENTINEL has passed QA AND the user has approved via PermissionGate.
Build order: architecture → scaffold → implement → test → SENTINEL review → deploy.
Self-heal deployment failures: read error logs, patch, redeploy. Max 3 attempts before escalating.
Every destructive action (deploy, delete, run) REQUIRES PermissionGate approval. No exceptions.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write a file',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
      {
        name: 'delete_file',
        description: 'Delete a file',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        name: 'run_command',
        description: 'Run a shell command',
        input_schema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
      {
        name: 'deploy',
        description: 'Deploy the application to Cloudflare Workers',
        input_schema: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string', enum: ['preview', 'production'] },
          },
          required: ['project', 'environment'],
        },
      },
    ],
  },

  atlas: {
    name: 'atlas',
    displayName: 'ATLAS',
    role: 'Engineering Specialist',
    color: '#00d4ff',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: false,
      can_delete: false,
      read_only: false,
      requires_approval: ['write_file'],
    },
    systemPrompt: `You are ATLAS, the engineering specialist for Leadership Legacy Digital.
Expertise: API 610/682 pump engineering, ASME calculations, pressure vessel design, rotating equipment.
You produce engineering calculations, specification sheets, and technical reports to industry standards.
Show all calculations with units and references. Flag any assumptions clearly.
Technical document writes REQUIRE user approval via PermissionGate.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write an engineering document or calculation sheet',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            format: { type: 'string', enum: ['pdf', 'xlsx', 'docx', 'txt'] },
          },
          required: ['filename', 'content'],
        },
      },
    ],
  },

  herald: {
    name: 'herald',
    displayName: 'HERALD',
    role: 'Content & Copy',
    color: '#2ed573',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: true,
      can_delete: false,
      read_only: false,
      requires_approval: ['send_email', 'publish_content'],
    },
    systemPrompt: `You are HERALD, the content and copywriting agent for Leadership Legacy Digital.
Craft compelling content: blog posts, email sequences, LinkedIn posts, landing page copy, case studies.
Voice: authoritative, clear, premium positioning. Write for decision-makers, not developers.
Generate complete content pieces, not outlines. Email sends and publishing REQUIRE PermissionGate approval.`,
    tools: [
      {
        name: 'send_email',
        description: 'Send a content email or newsletter',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            list: { type: 'string' },
          },
          required: ['subject', 'body'],
        },
      },
      {
        name: 'publish_content',
        description: 'Publish content to website or social platform',
        input_schema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['website', 'linkedin', 'twitter'] },
            content: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['platform', 'content'],
        },
      },
    ],
  },

  reel: {
    name: 'reel',
    displayName: 'REEL',
    role: 'Video & Animation',
    color: '#f5c842',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: false,
      can_delete: false,
      read_only: false,
      requires_approval: ['write_file', 'render_video'],
    },
    systemPrompt: `You are REEL, the video production agent for Leadership Legacy Digital.
Specialties: faceless YouTube channel strategy, CAD animation scripts, explainer video production.
Generate: scripts with timestamps, scene descriptions, B-roll notes, voiceover copy, thumbnail concepts.
Video renders and file writes REQUIRE PermissionGate approval.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write a script or production document',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
      },
      {
        name: 'render_video',
        description: 'Trigger a video render job',
        input_schema: {
          type: 'object',
          properties: {
            script_id: { type: 'string' },
            style: { type: 'string', enum: ['animation', 'slideshow', 'cad'] },
          },
          required: ['script_id'],
        },
      },
    ],
  },

  sentinel: {
    name: 'sentinel',
    displayName: 'SENTINEL',
    role: 'QA Gate',
    color: '#ff4757',
    permissions: {
      can_deploy: false,
      can_write_files: false,
      can_send_email: false,
      can_delete: false,
      read_only: true,
      requires_approval: [],
    },
    systemPrompt: `You are SENTINEL, the QA and quality gate agent for Leadership Legacy Digital.
Review all outputs before they reach clients or production. Score rigorously.
Scoring rubric: Correctness (30%), Completeness (25%), Code Quality (25%), Security (20%).
Score 0-100. PASS = 80+. FAIL = under 80. Return JSON: { score, pass, issues: [], recommendations: [] }.
Be thorough. A BUILDER deploy CANNOT proceed without your PASS. No exceptions.`,
    tools: [],
  },

  dispatch: {
    name: 'dispatch',
    displayName: 'DISPATCH',
    role: 'Client Delivery',
    color: '#00d4ff',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: true,
      can_delete: false,
      read_only: false,
      requires_approval: ['send_email', 'write_file'],
    },
    systemPrompt: `You are DISPATCH, the client delivery and packaging agent for Leadership Legacy Digital.
Prepare final deliverables: zip packages, handoff documents, client presentations, invoice drafts.
Ensure everything is client-ready before sending. Professional tone, clear instructions.
All sends and file writes REQUIRE PermissionGate approval.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write a delivery document or package',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
      },
      {
        name: 'send_email',
        description: 'Send deliverables to client',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            attachments: { type: 'array', items: { type: 'string' } },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
  },

  anchor: {
    name: 'anchor',
    displayName: 'ANCHOR',
    role: 'Revenue & MRR',
    color: '#2ed573',
    permissions: {
      can_deploy: false,
      can_write_files: true,
      can_send_email: false,
      can_delete: false,
      read_only: false,
      requires_approval: ['write_file'],
    },
    systemPrompt: `You are ANCHOR, the revenue tracking and MRR reporting agent for Leadership Legacy Digital.
Track: monthly recurring revenue, project pipeline value, client retention, growth metrics.
Generate: weekly revenue snapshots, MRR trend reports, client profitability analysis.
Flag churn risks immediately. Recommend pricing and packaging improvements based on data.
Report writes REQUIRE PermissionGate approval.`,
    tools: [
      {
        name: 'write_file',
        description: 'Write a revenue report',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string' },
            content: { type: 'string' },
            period: { type: 'string' },
          },
          required: ['filename', 'content'],
        },
      },
    ],
  },
}

export function getAgent(name: string): AgentConfig | undefined {
  return AGENTS[name as AgentName]
}

export const AGENT_LIST = Object.values(AGENTS)
