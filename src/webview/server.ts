/** Configuration stays in the communication layer; saved origins are account boundaries. */
export function validServer(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('请输入 HTTP(S) 服务根地址，不带用户名、路径或查询参数');
  }
  const host = url.hostname.toLowerCase();
  const octets = host.split('.').map(Number);
  const ipv4 = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' ||
    /^\[f[cd][\da-f]{2}:/.test(host) || /^\[fe[89ab][\da-f]:/.test(host) ||
    (ipv4 && (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254)));
  if (url.protocol === 'http:' && !local) throw new Error('公网服务请使用 HTTPS；HTTP 仅限本机和局域网开发地址');
  return url.origin;
}

export function defaultServer(configured?: string) {
  return validServer(configured || 'http://127.0.0.1:5667');
}
