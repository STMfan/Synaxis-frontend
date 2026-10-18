# 字体与图标

公开版本默认使用设备的系统字体。正文、科目、会话标题与过渡动画共享 `--body` 字体栈，系统缺少某个中文字形时由系统中文无衬线字体补足。Expert 英文代号和代码使用随附的 JetBrains Mono，数学公式使用 MathJax TeX 字体。

OPPO Sans 与钉钉进步体的字体文件不随公开源码或构建产物分发。样式仅保留 CSS `local()` 入口：设备安装 OPPO Sans 后可用于正文，安装钉钉进步体后可用于问候语与页面标题；未安装时统一回退到正文系统字体栈。应用不会下载、转换或导入这两款字体。

| 资源 | 官方来源 | 公开工程中的处理 |
|---|---|---|
| OPPO Sans | [ColorOS 官方发布与条款](https://www.coloros.com/article/A00000074/) | 仅引用设备已安装的字体，不包含字体文件 |
| 钉钉进步体 | [钉钉官方下载页](https://page.dingtalk.com/wow/dingtalk/default/dingtalk/y-W5aF3_ZJwzulU0nceIl) | 仅引用设备已安装的字体，保留随附许可 PDF 供维护核对 |
| JetBrains Mono 2.304 | [JetBrains 官方](https://www.jetbrains.com/lp/mono/) / [官方发行仓库](https://github.com/JetBrains/JetBrainsMono) | 保留原始 WOFF2 与 OFL 1.1 许可证 |
| Material Design Icons 7.4.47 | [官方发行仓库](https://github.com/Templarian/MaterialDesign-JS/tree/v7.4.47) | 仅使用选中的 SVG path，保留 Apache 2.0 许可证 |

如需使用可选字体，请从对应官方页面获取原始字体，阅读当前条款，通过操作系统的字体管理功能安装，然后完全退出并重新打开客户端。无需重新构建应用，也无需把字体文件放入源码目录。

本地字体是否能被 CSS `local()` 发现取决于系统字体注册、WebView 版本及平台的字体访问限制；安装成功不代表每个 WebView 都能访问。Android 等移动系统通常也不提供通用的用户字体安装能力。无法访问时客户端继续使用系统字体，不承诺跨平台获得完全相同的字形。

`public/licenses/` 保存第三方许可及来源说明；项目的 MIT 许可证不授予第三方字体、图标或品牌素材的额外使用权。OPPO 来源说明不是字体的再分发授权，钉钉许可 PDF 也不随附任何字体二进制文件。
