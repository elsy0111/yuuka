# Agent workflow

For non-trivial tasks, use actual subagents.

The main agent acts as lead.

Rules:

* Do not simulate subagents in a single context.
* Split work into independent parts.
* Run suitable subagents in parallel.
* Each subagent reads only minimum necessary files.
* Avoid sharing unrelated context.
* Avoid editing the same file concurrently.
* Show a short delegation plan before changes.
* Synthesize results after subagents finish.
* Keep final reports concise.

Preferred roles:

* implementation-agent
* test-agent
* review-agent
* infra-agent (if deployment/config involved)

The lead agent is responsible for:

* task decomposition
* parallelization decisions
* conflict prevention
* verification
* final integration
* minimizing token usage and context pollution
