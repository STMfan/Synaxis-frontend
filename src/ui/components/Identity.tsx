import type { ExpertName } from '../../webview/types';
import { expertAssets } from '../stores/context';
export function ExpertIdentity({ name, logo = true, heroId }: { name: ExpertName | null; logo?: boolean; heroId?: string }) {
  return name ? <span class="expert-identity">{logo && <img data-hero-key={heroId ? `expert-logo:${heroId}` : undefined} src={`/logos/${expertAssets[name]}.png`} alt="" width="24" height="24" />}<span class="expert-code" data-hero-key={heroId ? `expert-code:${heroId}` : undefined}>{name}</span></span> : null;
}
