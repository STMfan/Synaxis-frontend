import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = process.env.SYNAXIS_QA_PYTHON
  ? [process.env.SYNAXIS_QA_PYTHON]
  : process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
const python = candidates.find(command => spawnSync(command, ['-c', 'import sys, playwright; assert sys.version_info >= (3, 11)'], { cwd: root, stdio: 'ignore' }).status === 0);
if (!python) {
  console.error('Browser QA needs Python 3.11+ with Playwright. Run python -m pip install -r tests/requirements-browser.txt and python -m playwright install chromium. Set SYNAXIS_QA_PYTHON when using a virtual environment.');
  process.exit(1);
}
const result = spawnSync(python, ['tests/browser_qa.py'], { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
