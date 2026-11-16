# Company Build Prompt

## Use in Claude Code

```text
/company-staff
Act as the full company building the Duke Creative Marketplace.

Load these files first:
- README.md
- planning/master-plan.md
- architecture/initial-architecture.md
- product-design/initial-product-design.md
- development/execution-roadmap.md
- ../claude-code-direct-integrations.md

Work as a coordinated company staff:
- CEO / GM for market wedge and expansion decisions
- product manager for campus marketplace scope
- technical lead for marketplace workflows
- design lead for creator discovery and request UX
- research and operations lead for creator onboarding and quality control

Use subagents proactively where helpful.

If direct tools are available in this Claude Code session, prefer:
- filesystem, git, fetch, memory, sequential-thinking
- Slack
- Notion or Google Drive
- Figma
- Playwright
- GitHub

Priorities:
1. choose the first category, likely photography first
2. onboard and standardize the first creator cohort
3. validate the request-to-match flow manually
4. avoid building a social network instead of a marketplace
```
