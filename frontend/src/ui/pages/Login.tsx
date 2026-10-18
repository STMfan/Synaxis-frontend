import { useState } from 'preact/hooks';
import { useClient, errorText } from '../stores/context';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Touch';
export function Login() {
  const { bridge, refresh, notify, navigate } = useClient(); const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  async function login(e: SubmitEvent) { e.preventDefault(); const data = new FormData(e.currentTarget as HTMLFormElement); setBusy(true); try { await bridge.login(String(data.get('username')), String(data.get('password')), data.get('remember') === 'on'); await refresh(); } catch (error) { notify(errorText(error)); } finally { setBusy(false); } }
  return <div class="login-wrap"><div class="login-editorial"><h1>每个好问题，<br />都有新的可能。</h1><p>在提示与思考之间，<br />让自己的理解慢慢清晰。</p></div><form class="login-form" onSubmit={login}><img class="app-logo" src="/logos/00-synaxis.png" alt="Synaxis 交汇双弧标志" /><h2>进入研习室</h2><p class="muted">使用管理员提供的账号登录</p><label>用户名<input name="username" autoComplete="username" maxLength={100} required /></label><label>密码<input name="password" type="password" autoComplete="current-password" maxLength={1024} required /></label><input type="hidden" name="remember" value={remember ? "on" : "off"} /><Switch label="28 天内自动登录" checked={remember} onChange={setRemember} /><button class="primary" disabled={busy}>{busy ? '正在登录…' : '登录'}<Icon name="arrow" /></button><p class="login-foot">到期后重新登录，不保存密码。</p><button class="text-button" type="button" onClick={() => navigate('settings')}>配置服务连接<Icon name="arrow" /></button></form></div>;
}

