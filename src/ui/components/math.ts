import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const engine = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams'], maxBuffer: 20000, maxMacros: 1000 }), OutputJax: new SVG({ fontData: new MathJaxTexFont(), fontCache: 'local' }) });
export async function formula(source: string, display: boolean) {
  // No require/autoload/HTML/network extensions. SVG fonts stay in the bundle.
  return adaptor.outerHTML(await engine.convertPromise(source, { display }));
}
