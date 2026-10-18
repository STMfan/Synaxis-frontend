export interface Route { page: string; id: string }
interface Entry { route: Route; depth: number; scroll: number; sheet?: string }
const KEY = 'synaxisRoute';
/** Same-document history works in browsers and the native Android WebView. */
export class Navigation {
  private entry: Entry = { route: { page: 'home', id: '' }, depth: 0, scroll: 0 };
  private sheets = new Map<string, () => void>();
  private changed: (route: Route, backward: boolean, scroll: number) => void;
  private pending = false;
  constructor(changed: (route: Route, backward: boolean, scroll: number) => void) {
    this.changed = changed;
    history.scrollRestoration = 'manual';
    const saved = history.state?.[KEY] as Entry | undefined;
    this.entry = saved && !saved.sheet ? saved : this.entry;
    history.replaceState({ [KEY]: this.entry }, '');
  }
  current() { return this.entry.route; }
  start() { addEventListener('popstate', this.pop); return () => removeEventListener('popstate', this.pop); }
  private pop = (event: PopStateEvent) => {
    this.pending = false;
    const next = event.state?.[KEY] as Entry | undefined;
    if (!next) { this.reset(); return; }
    const previous = this.entry; this.entry = next;
    if (previous.sheet) { this.sheets.get(previous.sheet)?.(); this.sheets.delete(previous.sheet); }
    if (previous.route.page !== next.route.page || previous.route.id !== next.route.id) this.changed(next.route, next.depth < previous.depth, next.scroll);
  };
  go(route: Route) {
    if (this.pending || this.entry.sheet || (route.page === this.entry.route.page && route.id === this.entry.route.id)) return;
    this.entry.scroll = scrollY; history.replaceState({ [KEY]: this.entry }, '');
    this.entry = { route, depth: this.entry.depth + 1, scroll: 0 };
    history.pushState({ [KEY]: this.entry }, ''); this.changed(route, false, 0);
  }
  back() {
    if (this.pending) return true;
    if (!this.entry.depth) return false;
    this.pending = true; history.back(); return true;
  }
  sheet(close: () => void) {
    const id = crypto.randomUUID(); this.sheets.set(id, close);
    this.entry.scroll = scrollY; history.replaceState({ [KEY]: this.entry }, '');
    this.entry = { ...this.entry, depth: this.entry.depth + 1, sheet: id };
    history.pushState({ [KEY]: this.entry }, '');
    return () => { if (this.entry.sheet === id) this.back(); this.sheets.delete(id); };
  }
  reset() {
    this.pending = false; this.sheets.clear(); this.entry = { route: { page: 'home', id: '' }, depth: 0, scroll: 0 };
    history.replaceState({ [KEY]: this.entry }, ''); this.changed(this.entry.route, true, 0);
  }
}
export let navigation: Navigation;
export function installNavigation(value: Navigation) { navigation = value; }
