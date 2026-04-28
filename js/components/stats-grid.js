// ==========================================
// stats-grid Lit 组件 — 角色属性面板
// 替代原逐个 getElementById + innerText 的手动更新
// ==========================================
import { LitElement, html } from '../../lib/lit-core.min.js';
import { formatNumber } from '../engine.js';

export class StatsGrid extends LitElement {
    static properties = {
        atk: { type: Number },
        int: { type: Number },
        haste: { type: Number },
        crit: { type: Number },
        versa: { type: Number }
    };

    constructor() {
        super();
        this.atk = 0;
        this.int = 0;
        this.haste = 0;
        this.crit = 0;
        this.versa = 0;
    }

    // 使用 Light DOM 复用 base.css 中 .stats-grid / .stat-item 等全局样式
    createRenderRoot() {
        return this;
    }

    render() {
        const gcd = (2.5 / (1 + this.haste / 100)).toFixed(2) + 's';
        return html`
            <div class="stat-item"><span>攻击力</span><span>${formatNumber(this.atk)}</span></div>
            <div class="stat-item"><span>防御力</span><span>${formatNumber(this.int)}</span></div>
            <div class="stat-item"><span>冷却缩减</span><span>${this.haste.toFixed(1)}</span></div>
            <div class="stat-item"><span>暴击率</span><span>${this.crit.toFixed(1)}</span></div>
            <div class="stat-item"><span>共鸣</span><span>${this.versa.toFixed(1)}</span></div>
            <div class="stat-item"><span>GCD</span><span>${gcd}</span></div>
        `;
    }
}

customElements.define('stats-grid', StatsGrid);
