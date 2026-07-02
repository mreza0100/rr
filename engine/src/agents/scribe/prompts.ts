// SCRIBE prompts — the crash-safety checkpoint template + its assembly function. Template strings are
// module-level consts; buildScribe only assembles/substitutes the dir + content.
import { render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { ScribeArgs } from '../../types/index.js';

const SCRIBE_TPL = `{{! scribe — per-wave crash-safety checkpoint: write the given content verbatim to _checkpoint.json }}
You are the SCRIBE. Write a crash-safety checkpoint — the content below arrives ready to write exactly as given; never clip, reformat, or otherwise alter it.
Directory: {{dir}}
Content — write VERBATIM:
{{content}}
Steps: mkdir -p {{dir}}; write the content above VERBATIM to {{dir}}/_checkpoint.json via a Bash heredoc with a QUOTED delimiter (e.g. <<'EOF', so shell metacharacters inside the content are never expanded) or python3 -c — never truncate it; then verify the write with \`wc -c\` on the file.
Return ok:true once verified.{{FINISH}}
`;

export const buildScribe = ({ content, dir }: ScribeArgs) =>
  render(SCRIBE_TPL, { content, dir, FINISH });
