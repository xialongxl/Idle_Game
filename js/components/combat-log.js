// ==========================================
// combat-log Lit 组件 — 战斗日志区域
// 替代原 innerHTML 手动追加，使用 Light DOM 保持全局 CSS
// ==========================================
import { LitElement, html } from '../../lib/lit-core.min.js';
import { EBus } from '../engine.js';

export class CombatLog extends LitElement {
    static properties = {
        _trigger: { state: true }
    };

    constructor() {
        super();
        this._maxEntries = 200;
        this._trigger = 0;
    }

    // 使用 Light DOM，确保 index.html 中 .log-area 的 CSS 样式生效
    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._onLogAppend = (htmlStr) => {
            this._appendLog(htmlStr);
        };
        EBus.on('log_append', this._onLogAppend);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        EBus.off('log_append', this._onLogAppend);
    }

    // 增量追加单条日志，避免全量重渲染；超出上限时移除最早条目
    _appendLog(htmlStr) {
        const temp = document.createElement('div');
        temp.innerHTML = htmlStr;
        const child = temp.firstChild;
        if (child) {
            this.appendChild(child);
            while (this.children.length > this._maxEntries) {
                this.removeChild(this.firstChild);
            }
            this.scrollTop = this.scrollHeight;
        }
        this._trigger = this.children.length;
    }

    render() {
        // Light DOM 下子节点已手动管理，模板仅返回空内容
        return html``;
    }
}

customElements.define('combat-log', CombatLog);
